import { NormalizationOutput } from './schemas.js';

/**
 * Hard caps on what the AI is allowed to put into a care record.
 *
 * The prompt asks the model to stay terse and factual, but a prompt is a
 * request, not a limit. These are applied to every normalization result before
 * it is written, so a rambling voice memo or an over-eager model cannot fill a
 * timeline card — or a doctor-visit report — with dozens of fields nobody
 * checked.
 *
 * Raw caregiver input is never touched by any of this: `rawInput` is the
 * record of what was actually said, and only the derived fields are capped.
 */
export const AI_OUTPUT_LIMITS = {
  /** Fields shown as chips on an event card. */
  maxStructuredFields: 12,
  maxKeyLength: 40,
  /** A structured value is a label, not a paragraph. */
  maxValueLength: 120,
  maxArrayItems: 6,
  maxFlags: 6,
  maxFlagLength: 40,
  /** Photo descriptions render inline under the event text. */
  maxVisionSummaryLength: 240,
} as const;

/** Truncates on a word boundary where one is close to the limit. */
export function truncate(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;

  const hard = trimmed.slice(0, limit);
  const lastSpace = hard.lastIndexOf(' ');
  const body = lastSpace > limit * 0.6 ? hard.slice(0, lastSpace) : hard;

  return `${body.trimEnd()}…`;
}

/**
 * Scalars survive as themselves; short arrays of scalars survive trimmed.
 * Nested objects are dropped rather than stringified — the timeline renders
 * unknown values with JSON.stringify, and a blob of JSON on a care card is
 * noise at best and misleading at worst.
 */
function capValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const capped = truncate(value, AI_OUTPUT_LIMITS.maxValueLength);
    return capped === '' ? undefined : capped;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    const items = value
      .slice(0, AI_OUTPUT_LIMITS.maxArrayItems)
      .map((item) =>
        typeof item === 'string'
          ? truncate(item, AI_OUTPUT_LIMITS.maxValueLength)
          : typeof item === 'number' || typeof item === 'boolean'
            ? item
            : undefined
      )
      .filter((item) => item !== undefined && item !== '');

    return items.length > 0 ? items : undefined;
  }

  return undefined;
}

function capStructuredData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(data)
    .reduce<Array<[string, unknown]>>((acc, [key, value]) => {
      if (acc.length >= AI_OUTPUT_LIMITS.maxStructuredFields) return acc;
      const capped = capValue(value);
      if (capped === undefined) return acc;
      const cappedKey = truncate(key, AI_OUTPUT_LIMITS.maxKeyLength);
      if (cappedKey === '') return acc;
      return [...acc, [cappedKey, capped]];
    }, [])
    .reduce<Record<string, unknown>>((acc, [key, value]) => ({ ...acc, [key]: value }), {});
}

function capFlags(flags: string[]): string[] {
  return flags
    .map((flag) => truncate(flag, AI_OUTPUT_LIMITS.maxFlagLength))
    .filter((flag) => flag !== '')
    .filter((flag, index, all) => all.indexOf(flag) === index)
    .slice(0, AI_OUTPUT_LIMITS.maxFlags);
}

/** Applies every cap above, returning a new output object. */
export function capNormalizationOutput(output: NormalizationOutput): NormalizationOutput {
  return {
    ...output,
    structuredData: capStructuredData(output.structuredData),
    flags: capFlags(output.flags),
  };
}

/** Photo descriptions are shown inline, so they get a length cap of their own. */
export function capVisionSummary(summary: string): string {
  return truncate(summary, AI_OUTPUT_LIMITS.maxVisionSummaryLength);
}
