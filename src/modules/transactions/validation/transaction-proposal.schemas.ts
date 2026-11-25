import { z } from 'zod';

export const MAX_SEARCH_CHARS: number = 60;

export const transactionCategorizeInputSchema = z
    .object({
        categoryKey: z.string().min(1).max(64).describe('Category key from list_categories'),
        always: z.boolean().optional().describe('True when the person wants every similar transaction to go to this category from now on'),
        search: z
            .string()
            .trim()
            .min(1)
            .max(MAX_SEARCH_CHARS)
            .optional()
            .describe('Word of the merchant or description the person mentioned, only to narrow the list the person picks from')
    })
    .strict();

export type TransactionCategorizeInput = z.infer<typeof transactionCategorizeInputSchema>;

export const transactionProposalPayloadSchema = z.object({
    categoryId: z.string().uuid(),
    always: z.boolean(),
    search: z.string().nullable()
});

export type TransactionProposalPayload = z.infer<typeof transactionProposalPayloadSchema>;
