import { z } from 'zod';
import { REJECTION_REASON_VALUES } from '../domain/statement-import.types';

export const modelPreviewPayloadSchema = z.object({
    rows: z.array(
        z.object({
            line: z.number().int(),
            date: z.string(),
            amountMinor: z.number().int(),
            description: z.string(),
            externalId: z.string().nullable()
        })
    ),
    rejections: z.array(z.object({ line: z.number().int(), reason: z.enum(REJECTION_REASON_VALUES) })),
    currency: z.string().nullable(),
    accountHint: z.object({ institution: z.string().nullable(), numberLast4: z.string().nullable() }).nullable(),
    pagesNotRead: z.array(z.string())
});
