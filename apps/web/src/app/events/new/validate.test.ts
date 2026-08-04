import { describe, it, expect } from 'vitest';
import {
  validateEventDraft,
  hasDraftErrors,
  EMPTY_DRAFT_MESSAGE,
  INVALID_TIME_MESSAGE,
} from './validate';

const occurredAt = '2026-08-04T09:30';

describe('validateEventDraft', () => {
  it('accepts a draft with text and no attachments', () => {
    const errors = validateEventDraft({
      rawInput: 'Gave the nebulizer treatment',
      occurredAt,
      attachmentCount: 0,
    });

    expect(errors).toEqual({});
    expect(hasDraftErrors(errors)).toBe(false);
  });

  // Voice-only and photo-only logging: a caregiver mid-task should never have
  // to type to save what they just recorded.
  it('accepts a draft with no text when an attachment is present', () => {
    expect(
      validateEventDraft({ rawInput: '', occurredAt, attachmentCount: 1 })
    ).toEqual({});
    expect(
      validateEventDraft({ rawInput: '   ', occurredAt, attachmentCount: 2 })
    ).toEqual({});
  });

  it('rejects a draft with neither text nor attachments', () => {
    expect(
      validateEventDraft({ rawInput: '', occurredAt, attachmentCount: 0 }).rawInput
    ).toBe(EMPTY_DRAFT_MESSAGE);
  });

  it('treats whitespace-only text as empty', () => {
    expect(
      validateEventDraft({ rawInput: '  \n ', occurredAt, attachmentCount: 0 }).rawInput
    ).toBe(EMPTY_DRAFT_MESSAGE);
  });

  it('rejects a missing or unparseable occurred-at', () => {
    expect(
      validateEventDraft({ rawInput: 'Lunch', occurredAt: '', attachmentCount: 0 }).occurredAt
    ).toBe(INVALID_TIME_MESSAGE);
    expect(
      validateEventDraft({ rawInput: 'Lunch', occurredAt: 'yesterday', attachmentCount: 0 })
        .occurredAt
    ).toBe(INVALID_TIME_MESSAGE);
  });

  it('reports both problems at once', () => {
    const errors = validateEventDraft({ rawInput: '', occurredAt: '', attachmentCount: 0 });

    expect(errors.rawInput).toBe(EMPTY_DRAFT_MESSAGE);
    expect(errors.occurredAt).toBe(INVALID_TIME_MESSAGE);
    expect(hasDraftErrors(errors)).toBe(true);
  });
});
