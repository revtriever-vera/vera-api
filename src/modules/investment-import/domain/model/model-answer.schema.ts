import { z } from 'zod';
import { DOCUMENT_TYPES, DocumentType } from '../investment-statement.types';

const QUANTITY_PATTERN: RegExp = /^\d{1,18}(\.\d{1,10})?$/;
const PRICE_PATTERN: RegExp = /^\d{1,16}(\.\d{1,8})?$/;
const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT: number = 80;
export const MAX_OPERATIONS_PER_ANSWER: number = 500;

const KINDS = ['buy', 'sell', 'split', 'reverse_split', 'bonus', 'income', 'transfer'] as const;
const INCOMES = ['dividend', 'jcp', 'fii_income', 'interest', 'staking'] as const;
const DOCUMENT_VALUES = Object.values(DOCUMENT_TYPES) as [DocumentType, ...DocumentType[]];

export const answerEnvelopeSchema = z.object({
    documentType: z.enum(DOCUMENT_VALUES),
    currency: z.string().trim().length(3),
    totalMinor: z.number().int().nullable().optional(),
    periodStart: z.string().regex(DATE_PATTERN).nullable().optional().catch(null),
    periodEnd: z.string().regex(DATE_PATTERN).nullable().optional().catch(null),
    operations: z.array(z.unknown()).max(MAX_OPERATIONS_PER_ANSWER),
    positions: z.array(z.unknown()).max(MAX_OPERATIONS_PER_ANSWER).optional().catch([]),
    taxWithholdings: z.array(z.unknown()).max(MAX_OPERATIONS_PER_ANSWER).optional().catch([]),
    cashMovements: z.array(z.unknown()).max(MAX_OPERATIONS_PER_ANSWER).optional().catch([])
});

export const answerPositionSchema = z.object({
    block: z.enum(['equities', 'options', 'fixed_income', 'mutual_fund']),
    symbol: z.string().trim().min(1).max(MAX_TEXT),
    quantity: z.string().regex(QUANTITY_PATTERN)
});

export const answerWithholdingSchema = z.object({
    tradeDate: z.string().regex(DATE_PATTERN),
    ticker: z.string().trim().min(1).max(MAX_TEXT),
    amountMinor: z.number().int().positive()
});

export const answerCashMovementSchema = z.object({
    tradeDate: z.string().regex(DATE_PATTERN),
    direction: z.enum(['credit', 'debit']),
    amountMinor: z.number().int().positive()
});

export const answerOperationSchema = z.object({
    kind: z.enum(KINDS),
    incomeKind: z.enum(INCOMES).nullable().optional(),
    direction: z.enum(['credit', 'debit']),
    tradeDate: z.string().regex(DATE_PATTERN),
    ticker: z.string().trim().min(1).max(MAX_TEXT),
    productName: z.string().max(MAX_TEXT).nullable().optional(),
    institution: z.string().max(MAX_TEXT).nullable().optional(),
    market: z.string().max(MAX_TEXT).nullable().optional(),
    securityId: z.string().trim().max(MAX_TEXT).nullable().optional(),
    quantity: z.string().regex(QUANTITY_PATTERN),
    unitPrice: z.string().regex(PRICE_PATTERN).nullable().optional(),
    grossMinor: z.number().int().nullable().optional(),
    currency: z.string().trim().length(3)
});

export type AnswerEnvelope = z.infer<typeof answerEnvelopeSchema>;
export type AnswerPosition = z.infer<typeof answerPositionSchema>;
export type AnswerWithholding = z.infer<typeof answerWithholdingSchema>;
export type AnswerCashMovement = z.infer<typeof answerCashMovementSchema>;
export type AnswerOperation = z.infer<typeof answerOperationSchema>;
