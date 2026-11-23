import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MAX_LIST_POSITION, TEXT_LIMIT } from '../domain/reminders.types';

const MAX_RAW_TEXT: number = 500;
const AT_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const TIME_PATTERN: RegExp = /^\d{2}:\d{2}$/;

export const reminderCreateInputSchema = z
    .object({
        text: z
            .string()
            .min(1)
            .max(MAX_RAW_TEXT)
            .describe(`What to remind the person of, in their words, without links; kept to ${String(TEXT_LIMIT)} characters`),
        kind: z.enum(['once', 'monthly']).describe('once fires one time at a date and time; monthly fires on the same day of every month'),
        at: z
            .string()
            .regex(AT_PATTERN)
            .optional()
            .describe('Required for once: local date YYYY-MM-DD or local date and time YYYY-MM-DDTHH:mm, in the person time zone'),
        dayOfMonth: z
            .number()
            .int()
            .min(1)
            .max(31)
            .optional()
            .describe('Required for monthly: day of the month, 1 to 31; day 29 to 31 falls on the last day of shorter months'),
        time: z.string().regex(TIME_PATTERN).optional().describe('Local time HH:mm; defaults to 09:00')
    })
    .strict()
    .refine((value) => (value.kind === 'once' ? value.at !== undefined : value.dayOfMonth !== undefined), {
        message: 'once needs at and monthly needs dayOfMonth'
    });

export const reminderCancelInputSchema = z
    .object({
        position: z.number().int().min(1).max(MAX_LIST_POSITION).describe('Position of the reminder in the numbered list the person sees')
    })
    .strict();

export const noReminderInputSchema = z.object({}).strict();

export const createPayloadSchema = z.object({
    text: z.string().min(1),
    kind: z.enum(['once', 'monthly']),
    onceAt: z.string().datetime().nullable(),
    dayOfMonth: z.number().int().min(1).max(31).nullable(),
    timeOfDay: z.string().regex(TIME_PATTERN),
    timezone: z.string().min(1)
});

export const deletePayloadSchema = z.object({ reminderId: z.string().uuid(), text: z.string() });

export const firePayloadSchema = z.object({ occurrenceId: z.string().uuid() });

export const reminderItemSchema = z.object({
    id: z.string().uuid().describe('Reminder id'),
    text: z.string().describe('What the person asked to be reminded of'),
    kind: z.enum(['once', 'monthly']).describe('once or monthly'),
    nextAt: z.string().datetime().nullable().describe('When the next reminder is due, null when none is scheduled'),
    dayOfMonth: z.number().int().nullable().describe('Day of the month for monthly reminders, null for once'),
    time: z.string().describe('Local time of day HH:mm in the account time zone'),
    createdVia: z.literal('whatsapp').describe('Reminders are only created through WhatsApp')
});

export const remindersListSchema = z.object({ items: z.array(reminderItemSchema).describe('The signed-in person active reminders') });

export const reminderIdParamSchema = z.object({ id: z.string().uuid().describe('Reminder id') });

export class ReminderIdParamsDto extends createZodDto(reminderIdParamSchema) {}

export type ReminderItem = z.infer<typeof reminderItemSchema>;
export type RemindersList = z.infer<typeof remindersListSchema>;
export type CreatePayload = z.infer<typeof createPayloadSchema>;
export type DeletePayload = z.infer<typeof deletePayloadSchema>;
export type FirePayloadInput = z.infer<typeof firePayloadSchema>;
