import { z } from 'zod';

export const evaluatePayloadSchema = z.object({ companyId: z.string().uuid() });

export type EvaluatePayload = z.infer<typeof evaluatePayloadSchema>;

export const behindGoalPropSchema = z.object({
    name: z.string(),
    targetMinor: z.number().int(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    remainingMinor: z.number().int(),
    monthlyMinor: z.number().int(),
    planMonthlyMinor: z.number().int(),
    overdue: z.boolean()
});

export const behindGoalsPropSchema = z.array(behindGoalPropSchema).min(1);

export type BehindGoalProp = z.infer<typeof behindGoalPropSchema>;
