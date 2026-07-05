import { prisma, EventStatus, EventCategory, writeAudit, Prisma } from '@carelog/db';
import { transcribeAttachment } from './transcribe.js';
import { analyzeImage } from './analyzeImage.js';
import { normalizeEventData } from './normalize.js';
import { applyConfidenceGate } from './confidenceGate.js';

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
  let aiModelVersion = 'claude-3-5-sonnet-20241022';

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
    }
  } catch (error) {
    console.error(`[worker] AI normalization failed for event ${eventId}:`, error);
    status = EventStatus.ai_failed;
    flags = ['ai_error'];
  }

  const before = { ...refreshed } as Record<string, unknown>;

  const updated = await prisma.careEvent.update({
    where: { id: eventId },
    data: {
      category: status === EventStatus.ai_failed ? refreshed.category : (structuredData?.category as EventCategory | undefined) ?? refreshed.category,
      status,
      structuredData: structuredData as unknown as Prisma.InputJsonValue | undefined,
      aiConfidence: confidence,
      aiFlags: flags,
      aiModelVersion,
      version: { increment: 1 },
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
