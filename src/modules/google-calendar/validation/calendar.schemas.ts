import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MAX_DURATION_MINUTES, MAX_TITLE_CHARS } from '../domain/calendar.types';

export const connectionViewSchema = z.object({
    status: z
        .enum(['none', 'active', 'revoked'])
        .describe('none: not connected; active: connected; revoked: Google no longer accepts the permission'),
    email: z.string().nullable().describe('Google account e-mail of the connection, null when not connected'),
    connectedAt: z.string().datetime().nullable().describe('When the person connected the calendar'),
    access: z.enum(['read_write', 'read_only']).nullable().describe('read_only: Vera lists events but cannot create them')
});
export type ConnectionViewResponse = z.infer<typeof connectionViewSchema>;

export const startResponseSchema = z.object({
    url: z.string().url().describe('Google consent URL the web app must redirect the browser to')
});
export type StartResponse = z.infer<typeof startResponseSchema>;

export const eventsResponseSchema = z.object({
    items: z
        .array(
            z.object({
                id: z.string().describe('Google event id'),
                title: z.string().describe('Event title'),
                start: z.string().datetime().describe('Start, ISO 8601 UTC'),
                end: z.string().datetime().describe('End, ISO 8601 UTC'),
                allDay: z.boolean().describe('True for all-day events (start and end are dates at 00:00 UTC)'),
                byVera: z.boolean().describe('True when Vera created the event from the person confirmation')
            })
        )
        .describe('Events of the next 7 days, at most 10, in start order')
});
export type EventsResponse = z.infer<typeof eventsResponseSchema>;

export const callbackQuerySchema = z.object({
    code: z.string().max(2048).optional().describe('Authorization code Google sends back'),
    state: z.string().max(4096).optional().describe('Encrypted state issued at the start of the flow'),
    error: z.string().max(256).optional().describe('Error Google sends back when the person denies the permission')
});
export class CallbackQueryDto extends createZodDto(callbackQuerySchema) {}

export const listToolInputSchema = z.object({
    from: z.string().optional().describe('Start of the period, local date and time like 2026-11-27T00:00; default now'),
    to: z.string().optional().describe('End of the period, local date and time; default 7 days after the start')
});

export const createToolInputSchema = z.object({
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS).describe('Meeting title, taken from the person message'),
    start: z
        .string()
        .optional()
        .describe(
            'Local start like 2026-11-27T15:00, resolved with today date and the person time zone; omit when the person gave no day and time'
        ),
    durationMinutes: z.number().int().min(1).max(MAX_DURATION_MINUTES).optional().describe('Duration in minutes; default 60')
});
