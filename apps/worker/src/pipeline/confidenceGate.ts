import { EventStatus } from '@carelog/db';
import { NormalizationOutput } from '@carelog/ai';

export type GatedResult = {
  status: EventStatus;
  structuredData: Record<string, unknown> | null;
  confidence: number;
  flags: string[];
};

export function applyConfidenceGate(output: NormalizationOutput): GatedResult {
  const flags = output.flags ?? [];

  if (output.confidence >= 0.8) {
    return {
      status: EventStatus.confirmed,
      structuredData: output.structuredData,
      confidence: output.confidence,
      flags,
    };
  }

  return {
    status: EventStatus.needs_review,
    structuredData: output.structuredData,
    confidence: output.confidence,
    flags: [...flags, 'low_confidence'],
  };
}
