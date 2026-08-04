export type EventDraft = {
  rawInput: string;
  occurredAt: string;
  attachmentCount: number;
};

export type EventDraftErrors = {
  rawInput?: string;
  occurredAt?: string;
};

export const EMPTY_DRAFT_MESSAGE =
  'Write what happened, or add a photo or voice memo.';

export const INVALID_TIME_MESSAGE = 'Enter the date and time this happened.';

export function validateEventDraft(draft: EventDraft): EventDraftErrors {
  const hasText = draft.rawInput.trim().length > 0;
  const hasAttachment = draft.attachmentCount > 0;
  const timeIsValid =
    draft.occurredAt.length > 0 && !Number.isNaN(new Date(draft.occurredAt).getTime());

  return {
    ...(hasText || hasAttachment ? {} : { rawInput: EMPTY_DRAFT_MESSAGE }),
    ...(timeIsValid ? {} : { occurredAt: INVALID_TIME_MESSAGE }),
  };
}

export function hasDraftErrors(errors: EventDraftErrors): boolean {
  return Boolean(errors.rawInput || errors.occurredAt);
}
