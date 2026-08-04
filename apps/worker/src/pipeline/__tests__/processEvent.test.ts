import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventStatus, EventCategory } from '@carelog/db';
import { applyConfidenceGate } from '../confidenceGate.js';
import { normalizeEventData, NormalizeContext } from '../normalize.js';
import * as ai from '@carelog/ai';

type PipelineEvent = NormalizeContext['event'];

const audioAttachment = {
  id: 'att-1',
  eventId: 'event-1',
  kind: 'audio' as const,
  storageKey: 'att-1.webm',
  mimeType: 'audio/webm',
  sizeBytes: 1234,
  uploadedAt: new Date(),
  transcript: 'lisinopril ten milligrams',
  visionSummary: null,
  createdAt: new Date(),
};

const photoAttachment = {
  id: 'att-2',
  eventId: 'event-1',
  kind: 'photo' as const,
  storageKey: 'att-2.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 5678,
  uploadedAt: new Date(),
  transcript: null,
  visionSummary: 'Pill organizer shows Monday AM compartment empty',
  createdAt: new Date(),
};

function buildEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    id: 'event-1',
    patientId: 'patient-1',
    authorId: 'user-1',
    category: null,
    status: EventStatus.pending_ai,
    occurredAt: new Date('2026-07-05T10:00:00Z'),
    capturedAt: new Date('2026-07-05T10:05:00Z'),
    rawInput: 'Gave her morning meds',
    structuredData: null,
    aiConfidence: null,
    aiFlags: [],
    aiModelVersion: null,
    aiClaimedAt: null,
    scheduleId: null,
    templateId: null,
    hasConflict: false,
    version: 1,
    clientId: 'web',
    idempotencyKey: 'key-1',
    updatedAt: new Date(),
    createdAt: new Date(),
    deletedAt: null,
    patient: {
      id: 'patient-1',
      name: 'Mom',
      dateOfBirth: null,
      medicalNotes: null,
      medications: [{ name: 'lisinopril', dose: '10 mg' }],
      createdAt: new Date(),
    },
    attachments: [audioAttachment, photoAttachment],
    ...overrides,
  };
}

vi.mock('@carelog/ai', async (importOriginal) => {
  const original = await importOriginal<typeof ai>();
  return {
    ...original,
    normalizeEvent: vi.fn(),
  };
});

describe('confidenceGate', () => {
  it('confirms events with confidence >= 0.8', () => {
    const result = applyConfidenceGate({
      category: EventCategory.nebulizer_treatment,
      structuredData: { medication: 'albuterol' },
      confidence: 0.85,
      flags: [],
    });

    expect(result.status).toBe(EventStatus.confirmed);
    expect(result.structuredData).toEqual({ medication: 'albuterol' });
  });

  it('flags events with confidence 0.5-0.8 as needs_review', () => {
    const result = applyConfidenceGate({
      category: EventCategory.mood_behavior,
      structuredData: { moodScore: 2 },
      confidence: 0.65,
      flags: ['possible_agitation'],
    });

    expect(result.status).toBe(EventStatus.needs_review);
    expect(result.flags).toContain('low_confidence');
  });

  it('flags events with confidence < 0.5 as needs_review', () => {
    const result = applyConfidenceGate({
      category: EventCategory.observation_other,
      structuredData: { notes: 'unclear' },
      confidence: 0.3,
      flags: [],
    });

    expect(result.status).toBe(EventStatus.needs_review);
    expect(result.flags).toContain('low_confidence');
  });
});

describe('normalizeEventData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes transcripts and vision summaries to the prompt', async () => {
    const mocked = vi.mocked(ai.normalizeEvent);
    mocked.mockResolvedValue({
      category: EventCategory.medication,
      structuredData: { medication: 'lisinopril' },
      confidence: 0.9,
      flags: [],
    });

    const event = {
      id: 'event-1',
      patientId: 'patient-1',
      authorId: 'user-1',
      category: null,
      status: EventStatus.pending_ai,
      occurredAt: new Date('2026-07-05T10:00:00Z'),
      capturedAt: new Date('2026-07-05T10:05:00Z'),
      rawInput: 'Gave her morning meds',
      structuredData: null,
      aiConfidence: null,
      aiFlags: [],
      aiModelVersion: null,
      aiClaimedAt: null,
      scheduleId: null,
      templateId: null,
      hasConflict: false,
      version: 1,
      clientId: 'web',
      idempotencyKey: 'key-1',
      updatedAt: new Date(),
      createdAt: new Date(),
      deletedAt: null,
      patient: {
        id: 'patient-1',
        name: 'Mom',
        dateOfBirth: null,
        medicalNotes: null,
        medications: [{ name: 'lisinopril', dose: '10 mg' }],
        createdAt: new Date(),
      },
      attachments: [
        {
          id: 'att-1',
          eventId: 'event-1',
          kind: 'audio' as const,
          storageKey: 'att-1.webm',
          mimeType: 'audio/webm',
          sizeBytes: 1234,
          uploadedAt: new Date(),
          transcript: 'lisinopril ten milligrams',
          visionSummary: null,
          createdAt: new Date(),
        },
        {
          id: 'att-2',
          eventId: 'event-1',
          kind: 'photo' as const,
          storageKey: 'att-2.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 5678,
          uploadedAt: new Date(),
          transcript: null,
          visionSummary: 'Pill organizer shows Monday AM compartment empty',
          createdAt: new Date(),
        },
      ],
    };

    const result = await normalizeEventData({
      event,
      schedules: [],
    });

    expect(result.category).toBe(EventCategory.medication);
    expect(mocked).toHaveBeenCalledOnce();
    const call = mocked.mock.calls[0][0];
    expect(call.prompt).toContain('Audio transcripts');
    expect(call.prompt).toContain('Photo descriptions');
    expect(call.prompt).toContain('lisinopril ten milligrams');
  });
});
