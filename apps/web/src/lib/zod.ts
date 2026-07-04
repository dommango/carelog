import { z } from 'zod';
import { EventCategory, Role } from '@carelog/db';

export const createEventSchema = z.object({
  rawInput: z.string().min(1, 'Required'),
  category: z.nativeEnum(EventCategory).optional(),
  occurredAt: z.string().datetime().default(() => new Date().toISOString()),
  templateId: z.string().uuid().optional(),
  scheduleId: z.string().uuid().optional(),
  clientId: z.string().min(1, 'Required'),
  idempotencyKey: z.string().uuid(),
});

export const updateEventSchema = z.object({
  rawInput: z.string().min(1).optional(),
  category: z.nativeEnum(EventCategory).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Required'),
  category: z.nativeEnum(EventCategory),
  defaults: z.record(z.string(), z.unknown()),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role),
  patientId: z.string().uuid(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
