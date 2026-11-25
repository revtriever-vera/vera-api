import { z } from 'zod';

const expectedLine = z.object({
    ticker: z.string(),
    kind: z.enum(['buy', 'sell']),
    quantity: z.string(),
    unitPrice: z.string(),
    grossMinor: z.number(),
    feesMinor: z.number(),
    check: z.string().optional()
});

export const noteCaseSchema = z.object({
    id: z.string().min(1),
    description: z.string(),
    file: z.string(),
    input: z.enum(['text', 'image']),
    personalData: z.array(z.string()).min(1),
    modelAnswer: z.record(z.string(), z.unknown()),
    expected: z.object({
        lines: z.array(expectedLine),
        ignored: z.array(z.object({ description: z.string(), reason: z.string() })),
        notes: z.array(z.object({ code: z.string(), count: z.number() }))
    })
});
