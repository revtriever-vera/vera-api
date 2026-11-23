import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const featureUsageSchema = z.object({
    usedBps: z.number().int().min(0).describe('Share of the monthly cap used by this feature, in basis points')
});

export const usageSchema = z.object({
    period: z.string().describe('Calendar month of the company, YYYY-MM, in its own time zone'),
    state: z.enum(['ok', 'warning', 'paused']).describe('ok, warning from 80%, paused at 100%'),
    usedBps: z.number().int().min(0).describe('Share of the monthly cap used, in basis points; 0 when there is no cap'),
    resetsAt: z.string().describe('When the period turns, 00:00 of day 1 in the company time zone (ISO 8601, UTC)'),
    byFeature: z.object({ ai: featureUsageSchema, whatsapp: featureUsageSchema }).describe('Usage by feature'),
    capMicros: z.number().int().nullable().describe('Cap in micros of BRL; only for self-hosted with a cap')
});

export class UsageDto extends createZodDto(usageSchema) {}
export type Usage = z.infer<typeof usageSchema>;
