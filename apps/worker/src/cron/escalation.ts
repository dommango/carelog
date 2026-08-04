import { z } from 'zod';

/**
 * Shape of `Schedule.escalation`, which is an unvalidated Json column.
 *
 * It was previously cast straight to its expected type. A schedule whose
 * escalation was written by hand, or by an older shape, produced
 * `undefined * 60_000 = NaN`; `now >= new Date(NaN)` is false, so escalations
 * silently never fired and nothing was logged. Parsing makes that loud.
 */
export const escalationSchema = z.object({
  afterMinutes: z.number().finite().nonnegative(),
  notify: z.array(z.string().min(1)),
  channel: z.enum(['push', 'sms']).optional(),
});

export type Escalation = z.infer<typeof escalationSchema>;

/** Returns null (and logs) when the column is malformed, so the tick continues. */
export function parseEscalation(value: unknown, scheduleId: string): Escalation | null {
  if (value === null || value === undefined) return null;

  const parsed = escalationSchema.safeParse(value);
  if (!parsed.success) {
    console.error(
      `[worker] Schedule ${scheduleId} has a malformed escalation config; skipping escalation:`,
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')
    );
    return null;
  }

  return parsed.data;
}
