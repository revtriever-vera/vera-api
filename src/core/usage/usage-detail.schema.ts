import { z } from 'zod';
import { InvalidUsageDetailError } from './usage.errors';
import { SEND_CATEGORIES, UsageDetail } from './usage.types';

const MODEL_PATTERN: RegExp = /^[A-Za-z0-9._:/-]{1,80}$/;

export const usageDetailSchema = z
    .object({
        model: z.string().regex(MODEL_PATTERN).optional(),
        inputTokens: z.number().int().min(0).optional(),
        outputTokens: z.number().int().min(0).optional(),
        category: z.enum(SEND_CATEGORIES).optional()
    })
    .strict();

export function parseUsageDetail(detail: UsageDetail | undefined): UsageDetail | null {
    if (detail === undefined) {
        return null;
    }
    const parsed = usageDetailSchema.safeParse(detail);
    if (!parsed.success) {
        throw new InvalidUsageDetailError(parsed.error);
    }
    return parsed.data;
}
