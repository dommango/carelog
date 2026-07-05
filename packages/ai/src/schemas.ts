import { z } from 'zod';
import { EventCategory } from '@carelog/db';

export const normalizationOutputSchema = z.object({
  category: z.nativeEnum(EventCategory),
  structuredData: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  flags: z.array(z.string()).default([]),
});

export type NormalizationOutput = z.infer<typeof normalizationOutputSchema>;

export const medicationSchema = z.object({
  name: z.string(),
  dose: z.string().optional(),
  route: z.string().optional(),
  timing: z.string().optional(),
});

export type Medication = z.infer<typeof medicationSchema>;
