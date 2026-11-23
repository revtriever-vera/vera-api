import { z } from 'zod';

export const entrySchema = z.object({
    date: z.string(),
    name: z.string(),
    amountMinor: z.number(),
    estimate: z.boolean(),
    card: z.boolean(),
    account: z.string()
});

export const alertSchema = z.object({
    kind: z.string(),
    name: z.string(),
    values: z.record(z.string(), z.union([z.string(), z.number()]))
});
