import { z } from 'zod';

export const extractCaseSchema = z.object({
    id: z.string(),
    task: z.literal('investment_extract'),
    mode: z.enum(['text', 'scanned']),
    file: z.string(),
    expected: z.string(),
    sections: z.array(z.enum(['period', 'operations', 'income', 'positions', 'taxWithholdings', 'cashMovements'])).min(1)
});
