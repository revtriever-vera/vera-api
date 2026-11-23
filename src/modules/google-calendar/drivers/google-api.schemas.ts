import { z } from 'zod';

export const tokenResponseSchema = z.object({
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
    id_token: z.string().optional()
});

export const errorResponseSchema = z.object({ error: z.string().optional() });

const whenSchema = z.object({ dateTime: z.string().optional(), date: z.string().optional() });

export const eventsResponseSchema = z.object({
    items: z
        .array(
            z.object({
                id: z.string(),
                summary: z.string().optional(),
                status: z.string().optional(),
                start: whenSchema,
                end: whenSchema,
                extendedProperties: z.object({ private: z.record(z.string(), z.string()).optional() }).optional()
            })
        )
        .default([])
});

export type GoogleTokenResponse = z.infer<typeof tokenResponseSchema>;
export type GoogleEvent = z.infer<typeof eventsResponseSchema>['items'][number];
