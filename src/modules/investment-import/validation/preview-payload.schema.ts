import { z } from 'zod';

const storedLineSchema = z.object({
    lineId: z.string(),
    lineNumber: z.number().int(),
    kind: z.enum(['buy', 'sell', 'split', 'reverse_split', 'bonus', 'income', 'transfer']),
    incomeKind: z.enum(['dividend', 'jcp', 'fii_income', 'interest', 'staking']).nullable(),
    direction: z.enum(['credit', 'debit']),
    tradeDate: z.string(),
    ticker: z.string(),
    quantity: z.string(),
    unitPrice: z.string().nullable(),
    grossMinor: z.number().int().nullable(),
    currency: z.string(),
    sourceRef: z.string()
});

export const previewPayloadSchema = z.object({ lines: z.array(storedLineSchema) });
