import { prisma, EventStatus, EventCategory, writeAudit, Prisma } from '@carelog/db';
import { CLAUDE_MODEL } from '@carelog/ai';
import { resolveScheduleId } from './resolveScheduleId.js';
import { transcribeAttachment } from './transcribe.js';
import { analyzeImage } from './analyzeImage.js';
import { normalizeEventData } from './normalize.js';
import { applyConfidenceGate } from './confidenceGate.js';

/**
 * How long a claim stays valid before another run may take it over. Comfortably
 * longer than a normal pipeline pass (transcription + vision + normalization,
 * each capped at 60s by the AI client) so a slow-but-alive run is never
 * duplicated, short enough that a crashed worker's events recover on their own.
 */
const CLAIM_TTL_MS = 10 * 60_000;

export async function processEvent(eventId: string): Promise<void> {
  console.log(`[worker] Processing event ${eventId}`);

  const event = await prisma.careEvent.findUnique({
    where: { id: eventId },
    include: {
      patient: true,
      attachments: true,
    },
  });

  if (!event) {
    console.warn(`[worker] Event ${eventId} not found`);
    return;
  }

  if (event.status !== EventStatus.pending_ai) {
    console.log(`[worker] Event ${eventId} status is ${event.status}; skipping`);
    return;
  }

  // Claim the row atomically. The status check above is a read, and the write
  // that acts on it lands much later — long enough for a duplicate delivery or
  // a retry to run the whole pipeline twice, paying for the AI call twice and
  // racing on the result. A conditional update is the only check that also
  // excludes everyone else.
  //
  // A lease rather than a flag: if the worker dies mid-run the claim would
  // otherwise be permanent and the event would sit at pending_ai forever, so a
  // claim older than CLAIM_TTL_MS is reclaimable.
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MS);

  const claim = await prisma.careEvent.updateMany({
    where: {
      id: eventId,
      status: EventStatus.pending_ai,
      OR: [{ aiClaimedAt: null }, { aiClaimedAt: { lt: staleBefore } }],
    },
    data: { aiClaimedAt: now },
  });

  if (claim.count === 0) {
    console.log(`[worker] Event ${eventId} is already being processed; skipping`);
    return;
  }

  const schedules = await prisma.schedule.findMany({
    where: { patientId: event.patientId, status: 'active' },
  });

  // Transcribe audio attachments.
  for (const attachment of event.attachments) {
    if (attachment.kind === 'audio' && !attachment.transcript) {
      await transcribeAttachment(attachment.id, attachment.storageKey);
    }
  }

  // Analyze photo attachments.
  for (const attachment of event.attachments) {
    if (attachment.kind === 'photo' && !attachment.visionSummary) {
      await analyzeImage(attachment.id, attachment.storageKey);
    }
  }

  // Refresh attachments after side-effect updates.
  const refreshed = await prisma.careEvent.findUnique({
    where: { id: eventId },
    include: { patient: true, attachments: true },
  });

  if (!refreshed) return;

  let status: EventStatus;
  let structuredData: Record<string, unknown> | null = null;
  let confidence: number | null = null;
  let flags: string[] = [];
  const aiModelVersion = CLAUDE_MODEL;
  let suggestedScheduleId: string | null | undefined;

  try {
    const hasAiKey = Boolean(process.env.ANTHROPIC_API_KEY);

    if (!hasAiKey) {
      console.warn(`[worker] ANTHROPIC_API_KEY missing; marking event ${eventId} ai_failed`);
      status = EventStatus.ai_failed;
      flags = ['ai_key_missing'];
    } else {
      const normalized = await normalizeEventData({ event: refreshed, schedules });
      const gated = applyConfidenceGate(normalized);
      status = gated.status;
      structuredData = gated.structuredData;
      confidence = gated.confidence;
      flags = gated.flags;
      suggestedScheduleId = normalized.scheduleId;
    }
  } catch (error) {
    // A malformed or off-schema answer is not a dead end: the raw input is
    // intact and a human can finish the job. Routing it to needs_review puts it
    // in the existing review queue instead of the ai_failed dead end, where it
    // was visible only as a red badge nobody could action.
    const recoverable = isRecoverableAiError(error);
    console.error(
      `[worker] AI normalization failed for event ${eventId} (${recoverable ? 'needs_review' : 'ai_failed'}):`,
      error
    );
    status = recoverable ? EventStatus.needs_review : EventStatus.ai_failed;
    flags = [recoverable ? 'ai_unparseable' : 'ai_error'];
  }

  const before = { ...refreshed } as Record<string, unknown>;

  const resolvedScheduleId = resolveScheduleId(refreshed.occurredAt, suggestedScheduleId, schedules);

  const updated = await prisma.careEvent.update({
    where: { id: eventId },
    data: {
      category:
        (structuredData?.category as EventCategory | undefined) ?? refreshed.category,
      status,
      structuredData: structuredData as unknown as Prisma.InputJsonValue | undefined,
      aiConfidence: confidence,
      aiFlags: flags,
      aiModelVersion,
      scheduleId: resolvedScheduleId,
      version: { increment: 1 },
      // Release the claim; the terminal status is what guards re-processing now.
      aiClaimedAt: null,
    },
  });

  await writeAudit({
    actorType: 'system',
    actorId: 'ai-pipeline',
    action: 'event.ai_process',
    entityType: 'event',
    entityId: eventId,
    before,
    after: updated as unknown as Record<string, unknown>,
    clientId: refreshed.clientId,
  });

  // Phase 3: emit sync signal (stub for now).
  console.log(`[worker] Event ${eventId} processed → ${status}`);
}

/**
 * Whether the AI step failed in a way a human reviewer can pick up.
 *
 * A response that would not parse, or that did not match the expected schema,
 * still leaves the caregiver's raw input untouched — someone can read it and
 * fill in the structure. A missing API key or a transport failure means the
 * step never ran, which is an operational problem, not a review task.
 */
function isRecoverableAiError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Normalization schema mismatch') || message.includes('no text content');
}
