import { z } from 'zod';

export const problemSchema = z.object({
    type: z.string().describe('Stable machine-readable error code (e.g. positions.position_not_found)'),
    title: z.string().describe('Error class name'),
    status: z.number().int().describe('HTTP status code'),
    detail: z.string().describe('Technical detail for logs/debugging — never a user-facing translated message'),
    requestId: z.string().nullable().describe('Correlation id — send it to support to locate the full trail'),
    meta: z.record(z.unknown()).optional().describe('Structured details safe for the frontend (field errors, ids)')
});
