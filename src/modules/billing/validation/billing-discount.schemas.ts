import { z } from 'zod';

export const discountRulesSchema = z.array(
    z.object({
        percent: z.number().int().min(1).max(100),
        fromCycle: z.number().int().min(1),
        toCycle: z.number().int().min(1)
    })
);
