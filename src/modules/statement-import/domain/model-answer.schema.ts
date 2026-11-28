import { z } from 'zod';
import { MAX_MODEL_TRANSACTIONS_PER_ANSWER } from './statement-import.types';

const MAX_TEXT: number = 500;
const MAX_INSTITUTION: number = 60;

export const modelAnswerSchema = z.object({
    currency: z
        .string()
        .trim()
        .regex(/^[A-Z]{3}$/)
        .nullable()
        .optional()
        .catch(null),
    institution: z.string().trim().min(1).max(MAX_INSTITUTION).nullable().optional().catch(null),
    accountLast4: z
        .string()
        .regex(/^\d{4}$/)
        .nullable()
        .optional()
        .catch(null),
    transactions: z.array(z.unknown()).max(MAX_MODEL_TRANSACTIONS_PER_ANSWER)
});

export const modelTransactionSchema = z.object({
    date: z.string().max(MAX_TEXT),
    description: z.string().max(MAX_TEXT),
    amountMinor: z.number()
});

export type ModelAnswer = z.infer<typeof modelAnswerSchema>;
export type ModelAnswerTransaction = z.infer<typeof modelTransactionSchema>;
