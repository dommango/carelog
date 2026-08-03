import { describe, expect, it } from 'vitest';
import { EventCategory } from '@carelog/db';
import {
  AI_OUTPUT_LIMITS,
  capNormalizationOutput,
  capVisionSummary,
  truncate,
} from './limits.js';
import type { NormalizationOutput } from './schemas.js';

const base: NormalizationOutput = {
  category: EventCategory.medication,
  structuredData: {},
  confidence: 0.9,
  flags: [],
  scheduleId: null,
};

describe('truncate', () => {
  it('leaves short values alone', () => {
    expect(truncate('albuterol', 40)).toBe('albuterol');
  });

  it('trims surrounding whitespace', () => {
    expect(truncate('  albuterol  ', 40)).toBe('albuterol');
  });

  it('cuts on a word boundary when one is near the limit', () => {
    expect(truncate('coughed a lot after the treatment', 20)).toBe('coughed a lot after…');
  });

  it('cuts mid-word rather than losing most of the value', () => {
    expect(truncate('a supercalifragilisticexpialidocious word', 20)).toBe(
      'a supercalifragilist…'
    );
  });
});

describe('capNormalizationOutput', () => {
  it('keeps a well-behaved result untouched', () => {
    const output = capNormalizationOutput({
      ...base,
      structuredData: { medication: 'albuterol', route: 'nebulizer', doses: 2 },
      flags: ['mentions_pain'],
    });

    expect(output.structuredData).toEqual({
      medication: 'albuterol',
      route: 'nebulizer',
      doses: 2,
    });
    expect(output.flags).toEqual(['mentions_pain']);
  });

  it('caps the number of structured fields', () => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`field${i}`, `value${i}`])
    );

    const output = capNormalizationOutput({ ...base, structuredData: many });

    expect(Object.keys(output.structuredData)).toHaveLength(
      AI_OUTPUT_LIMITS.maxStructuredFields
    );
    expect(Object.keys(output.structuredData)[0]).toBe('field0');
  });

  it('shortens a value that arrived as a paragraph', () => {
    const essay = 'she '.repeat(200);
    const output = capNormalizationOutput({ ...base, structuredData: { notes: essay } });

    expect((output.structuredData.notes as string).length).toBeLessThanOrEqual(
      AI_OUTPUT_LIMITS.maxValueLength + 1
    );
    expect(output.structuredData.notes as string).toMatch(/…$/);
  });

  it('trims long arrays and caps their items', () => {
    const output = capNormalizationOutput({
      ...base,
      structuredData: { observed: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
    });

    expect(output.structuredData.observed).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('drops nested objects rather than letting JSON blobs onto a care card', () => {
    const output = capNormalizationOutput({
      ...base,
      structuredData: { vitals: { bp: '120/80' }, medication: 'albuterol' },
    });

    expect(output.structuredData).toEqual({ medication: 'albuterol' });
  });

  it('drops empty values and empty arrays', () => {
    const output = capNormalizationOutput({
      ...base,
      structuredData: { notes: '   ', observed: [], tags: [null, undefined], dose: '2 puffs' },
    });

    expect(output.structuredData).toEqual({ dose: '2 puffs' });
  });

  it('keeps false and zero, which are real answers', () => {
    const output = capNormalizationOutput({
      ...base,
      structuredData: { refusedMeal: false, moodScore: 0 },
    });

    expect(output.structuredData).toEqual({ refusedMeal: false, moodScore: 0 });
  });

  it('caps, de-duplicates and shortens flags', () => {
    const output = capNormalizationOutput({
      ...base,
      flags: ['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });

    expect(output.flags).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('leaves category, confidence and scheduleId alone', () => {
    const output = capNormalizationOutput({
      ...base,
      category: EventCategory.mood_behavior,
      confidence: 0.42,
      scheduleId: '00000000-0000-0000-0000-000000000009',
    });

    expect(output.category).toBe(EventCategory.mood_behavior);
    expect(output.confidence).toBe(0.42);
    expect(output.scheduleId).toBe('00000000-0000-0000-0000-000000000009');
  });

  it('does not mutate the result it was given', () => {
    const input = {
      ...base,
      structuredData: { notes: 'x'.repeat(500) },
      flags: ['a', 'a'],
    };
    const snapshot = JSON.stringify(input);

    capNormalizationOutput(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('capVisionSummary', () => {
  it('leaves a brief description alone', () => {
    expect(capVisionSummary('A nebulizer cup on the counter.')).toBe(
      'A nebulizer cup on the counter.'
    );
  });

  it('cuts a description that ignored the brevity instruction', () => {
    const capped = capVisionSummary('The photo shows '.repeat(50));

    expect(capped.length).toBeLessThanOrEqual(AI_OUTPUT_LIMITS.maxVisionSummaryLength + 1);
    expect(capped).toMatch(/…$/);
  });
});
