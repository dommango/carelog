import { z } from 'zod';
import { EventCategory, Role, AttachmentKind } from '@carelog/db';

export const attachmentInputSchema = z.object({
  id: z.string().uuid(),
  kind: z.nativeEnum(AttachmentKind),
  mimeType: z.string(),
  sizeBytes: z.number().int().optional(),
});

export const createEventSchema = z.object({
  id: z.string().uuid().optional(),
  rawInput: z.string().min(1, 'Required'),
  category: z.nativeEnum(EventCategory).optional(),
  occurredAt: z.string().datetime().default(() => new Date().toISOString()),
  templateId: z.string().uuid().optional(),
  scheduleId: z.string().uuid().optional(),
  clientId: z.string().min(1, 'Required'),
  idempotencyKey: z.string().uuid(),
  attachments: z.array(attachmentInputSchema).max(5).default([]),
});

export const updateEventSchema = z.object({
  rawInput: z.string().min(1).optional(),
  category: z.nativeEnum(EventCategory).optional(),
  occurredAt: z.string().datetime().optional(),
  version: z.number().int().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Required'),
  category: z.nativeEnum(EventCategory),
  defaults: z.record(z.string(), z.unknown()),
});

const EARLIEST_DOB = Date.parse('1900-01-01');

export const createPatientSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  dateOfBirth: z.iso
    .date()
    .refine((value) => {
      const parsed = Date.parse(value);
      return parsed >= EARLIEST_DOB && parsed <= Date.now();
    }, 'Enter a date of birth in the past')
    .optional(),
  medicalNotes: z.string().trim().max(2000).optional(),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role),
  patientId: z.string().uuid(),
});

export const createScheduleSchema = z.object({
  patientId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  name: z.string().min(1, 'Required'),
  rrule: z.string().min(1, 'Required'),
  windowMinutes: z.number().int().min(1).default(90),
  remindOffsets: z.array(z.number().int()).default([0]),
  escalation: z
    .object({
      afterMinutes: z.number().int().min(1),
      notify: z.array(z.string().uuid()).min(1),
      channel: z.enum(['push', 'sms']).default('sms'),
    })
    .optional(),
});

export const updateScheduleSchema = createScheduleSchema.partial().omit({ patientId: true });

export const reportQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  category: z.nativeEnum(EventCategory).optional(),
  authorId: z.string().uuid().optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type CreateScheduleInput = z.input<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
