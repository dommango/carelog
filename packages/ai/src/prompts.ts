import { EventCategory } from '@carelog/db';
import { Medication } from './schemas.js';

export function buildNormalizationPrompt(context: {
  rawInput?: string | null;
  transcripts?: string[];
  visionSummaries?: string[];
  patientName?: string;
  medications?: Medication[];
  schedules?: Array<{ id: string; name: string; rrule: string; windowMinutes?: number }>;
  capturedAt: Date;
  occurredAt: Date;
}): string {
  const categoryList = Object.values(EventCategory).join(', ');

  const transcriptSection =
    context.transcripts && context.transcripts.length > 0
      ? `\n--- Audio transcripts ---\n${context.transcripts.join('\n')}`
      : '';

  const visionSection =
    context.visionSummaries && context.visionSummaries.length > 0
      ? `\n--- Photo descriptions ---\n${context.visionSummaries.join('\n')}`
      : '';

  const medSection =
    context.medications && context.medications.length > 0
      ? `\nPatient medications:\n${context.medications
          .map((m) => `- ${m.name}${m.dose ? ` ${m.dose}` : ''}${m.route ? ` (${m.route})` : ''}${m.timing ? ` — ${m.timing}` : ''}`)
          .join('\n')}`
      : '';

  const scheduleSection =
    context.schedules && context.schedules.length > 0
      ? `\nActive schedules (return scheduleId only if the input clearly matches a schedule whose time window is open around occurredAt):\n${context.schedules.map((s) => `- id=${s.id} name="${s.name}" window=${s.windowMinutes ?? 90}min`).join('\n')}`
      : '';

  return `You are a careful caregiver assistant. Convert the caregiver's input into a structured care event.

Rules:
- Use the category taxonomy exactly: ${categoryList}.
- Extract all relevant structured fields into structuredData. Use field names appropriate to the category (e.g., medication, dose, duration, meal, fluidOz, moodScore, observed, notes).
- Resolve relative times like "20 minutes ago" against capture time when possible.
- Map medication references ("breathing medicine", "her pill") to the patient's medication list when confident.
- Return confidence from 0 to 1. Use >=0.8 when the input is unambiguous and matches known meds/schedules. Use lower values for ambiguity, unclear audio, conflicting information, or unknown medications.
- Return flags for anything that needs human attention (e.g., "possible_missed_dose", "mentions_pain", "time_ambiguous", "unknown_medication").

Patient: ${context.patientName ?? 'the patient'}
Capture time: ${context.capturedAt.toISOString()}
Occurred-at hint: ${context.occurredAt.toISOString()}${medSection}${scheduleSection}

--- Raw input ---
${context.rawInput ?? '(none)'}${transcriptSection}${visionSection}

Return only the requested JSON object with keys: category, structuredData, confidence, flags, scheduleId.`;
}

export const fewShotExamples = [
  {
    input: 'Gave albuterol nebulizer about 20 minutes ago, she coughed a lot after.',
    output: {
      category: 'nebulizer_treatment',
      structuredData: {
        medication: 'albuterol',
        dose: '2.5 mg',
        route: 'nebulizer',
        relativeTime: '20 minutes ago',
        observations: ['coughed after treatment'],
      },
      confidence: 0.92,
      flags: [],
    },
  },
  {
    input: 'She seemed restless and kept asking to go home, didn\'t want lunch.',
    output: {
      category: 'mood_behavior',
      structuredData: {
        moodScore: 2,
        moodPhrase: 'restless, agitated',
        refusedMeal: true,
        observed: ['restlessness', 'repetitive asking to go home'],
      },
      confidence: 0.76,
      flags: ['refused_meal', 'possible_agitation'],
    },
  },
];
