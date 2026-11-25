import { z } from 'zod';
import {
    FIXED_INCOME_REASONS,
    FIXED_INCOME_STATUSES,
    FixedIncomeReason,
    FixedIncomeStatus
} from '../domain/fixed-income/fixed-income-import.types';

const STATUS_VALUES = Object.values(FIXED_INCOME_STATUSES) as [FixedIncomeStatus, ...FixedIncomeStatus[]];
const REASON_VALUES = Object.values(FIXED_INCOME_REASONS) as [FixedIncomeReason, ...FixedIncomeReason[]];
const TITLE_KIND_VALUES = ['cdb', 'lci', 'lca', 'lc', 'debenture', 'cri', 'cra'] as const;
const INDEXER_VALUES = ['cdi_percent', 'prefixed', 'ipca_plus'] as const;

const dollarSchema = z.object({
    fxRate: z.string().nullable(),
    grossBrlMinor: z.number().int().nullable(),
    withheldTaxMinor: z.number().int().nullable(),
    closingQuantity: z.string().nullable()
});

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
    feesMinor: z.number().int().default(0),
    currency: z.string(),
    market: z.string().default('B3'),
    sourceRef: z.string(),
    check: z.string().nullable().default(null),
    dollar: dollarSchema.optional()
});

const storedFixedIncomeSchema = z.object({
    lineId: z.string(),
    product: z.string(),
    issuerName: z.string().nullable(),
    issuerId: z.string().nullable(),
    kind: z.enum(TITLE_KIND_VALUES).nullable(),
    indexer: z.enum(INDEXER_VALUES).nullable(),
    rateBps: z.number().int().nullable(),
    appliedMinor: z.number().int().nullable(),
    appliedAt: z.string().nullable(),
    maturityDate: z.string().nullable(),
    status: z.enum(STATUS_VALUES),
    reason: z.enum(REASON_VALUES).nullable(),
    suggestion: z.string()
});

export const previewPayloadSchema = z.object({
    lines: z.array(storedLineSchema),
    fixedIncome: z.array(storedFixedIncomeSchema).default([])
});
