import { prisma, CareEvent, Attachment, Patient, Schedule } from '@carelog/db';
import { buildNormalizationPrompt, normalizeEvent } from '@carelog/ai';

export type NormalizeContext = {
  event: CareEvent & { patient: Patient; attachments: Attachment[] };
  schedules: Schedule[];
};

export async function normalizeEventData(context: NormalizeContext) {
  const { event, schedules } = context;

  const transcripts = event.attachments
    .map((a) => a.transcript)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);

  const visionSummaries = event.attachments
    .map((a) => a.visionSummary)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  const medications = Array.isArray(event.patient.medications)
    ? event.patient.medications
    : [];

  const prompt = buildNormalizationPrompt({
    rawInput: event.rawInput,
    transcripts,
    visionSummaries,
    patientName: event.patient.name,
    medications: medications as Array<{ name: string; dose?: string; route?: string; timing?: string }>,
    schedules: schedules.map((s) => ({ id: s.id, name: s.name, rrule: s.rrule, windowMinutes: s.windowMinutes })),
    capturedAt: event.capturedAt,
    occurredAt: event.occurredAt,
  });

  return normalizeEvent({ prompt });
}
