import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
    AiConcentrationContext,
    AiCutsContext,
    AiMaturitiesContext,
    AiMonthContext,
    AiPortfolioContext
} from '../domain/context/ai-context.types';

const MAX_GOAL_BPS: number = 9000;
const MAX_CONTRIBUTION_MINOR: number = 100_000_000_000;

const text = (description: string): z.ZodString => z.string().describe(description);
const nullableText = (description: string): z.ZodNullable<z.ZodString> => z.string().nullable().describe(description);

const categoryEntrySchema = z
    .object({
        chave: text('Stable key of the category: the system key or custom_<n>'),
        rotulo_padrao: text('Default label of a system category in the effective locale').optional(),
        tipo: z.enum(['fixo', 'flexivel']).describe('Fixed or flexible'),
        total: text('Spent this month, formatted'),
        media_3m: nullableText('Average of the last three months, formatted'),
        variacao_pct: nullableText('Change against the average, formatted with sign'),
        nova: z.boolean().describe('The category has no history')
    })
    .strict();

export const monthContextSchema: z.ZodType<AiMonthContext> = z
    .object({
        mes: text('Month, YYYY-MM'),
        parcial: z.boolean().describe('The month is not over'),
        renda: text('Income, formatted'),
        gastos: text('Expenses, formatted'),
        guardado: text('Amount saved, formatted'),
        taxa_poupanca: nullableText('Savings rate, formatted'),
        meta_economia_pct: text('Savings goal, formatted'),
        falta_para_meta: text('Missing to reach the goal, formatted'),
        fixos: z.object({ total: text('Fixed spending, formatted'), pct_renda: nullableText('Share of income') }).strict(),
        flexiveis: z.object({ total: text('Flexible spending, formatted') }).strict(),
        sem_categoria: z
            .object({ total: text('Uncategorized spending, formatted'), transacoes: z.number().int().describe('Uncategorized count') })
            .strict(),
        gastos_por_categoria: z.array(categoryEntrySchema).describe('Spending by category')
    })
    .strict();

const cutEntrySchema = z
    .object({
        chave: text('Stable key of the category'),
        rotulo_padrao: text('Default label of a system category').optional(),
        atual: text('Spent, formatted'),
        media_3m: nullableText('Three-month average, formatted'),
        cortar: text('Suggested cut, formatted'),
        limite_sugerido: text('Suggested limit, formatted')
    })
    .strict();

export const cutsContextSchema: z.ZodType<AiCutsContext> = z
    .object({
        meta_economia_pct: text('Savings goal, formatted'),
        falta_por_mes: text('Missing per month, formatted'),
        status: z.enum(['meta_batida', 'possivel', 'so_cortar_nao_resolve']).describe('Whether cutting can reach the goal'),
        categorias_flexiveis: z.array(cutEntrySchema).describe('Flexible categories with the suggested cut')
    })
    .strict();

const classEntrySchema = z
    .object({
        chave: text('Stable key of the class'),
        rotulo_padrao: text('Default label of a system class').optional(),
        atual: text('Current share, formatted'),
        meta: text('Target share, formatted'),
        situacao: z.enum(['abaixo', 'dentro', 'acima']).describe('Against the tolerance band')
    })
    .strict();

export const portfolioContextSchema: z.ZodType<AiPortfolioContext> = z
    .object({
        moeda_base: text('Base currency'),
        total: text('Total, formatted'),
        exposicao_dolar_pct: text('Dollar exposure, formatted'),
        tolerancia_pp: text('Tolerance in percentage points'),
        carteira_pct: z.array(classEntrySchema).describe('Allocation by class'),
        aporte_planejado: z
            .object({
                total: text('Planned contribution, formatted'),
                por_classe: z.array(z.object({ chave: text('Class key'), valor: text('Amount, formatted') }).strict())
            })
            .strict()
            .optional()
    })
    .strict();

export const concentrationContextSchema: z.ZodType<AiConcentrationContext> = z
    .object({
        moeda_base: text('Base currency'),
        total: text('Total counted, formatted'),
        total_acoes: text('Total of the equity classes, formatted'),
        por_emissor: z
            .array(
                z
                    .object({
                        emissor: text('Issuer group from the curated list, or the label of a fixed bucket'),
                        valor: text('Value, formatted'),
                        pct: text('Share of the total, formatted')
                    })
                    .strict()
            )
            .describe('Largest issuers'),
        outros_emissores: z
            .object({ pct: text('Share beyond the largest issuers'), grupos: z.number().int().describe('How many groups') })
            .strict()
            .optional(),
        por_setor: z
            .array(
                z
                    .object({
                        setor: text('Sector key from the closed list'),
                        valor: text('Value, formatted'),
                        pct: text('Share of the equities, formatted')
                    })
                    .strict()
            )
            .describe('Sectors of the equity holdings')
    })
    .strict();

export const maturitiesContextSchema: z.ZodType<AiMaturitiesContext> = z
    .object({
        moeda_base: text('Currency of every value'),
        ate: text('Last month covered, YYYY-MM'),
        total: text('Estimated value maturing in the period, formatted'),
        estimado: z.boolean().describe('Some value rests on an assumption'),
        por_tipo: z
            .array(
                z
                    .object({
                        tipo: text('Kind of security: cdb, lci, lca, tesouro...'),
                        total: text('Estimated value of the kind, formatted'),
                        vencimentos: z
                            .array(
                                z.object({ mes: text('Month of maturity, YYYY-MM'), valor: text('Estimated value, formatted') }).strict()
                            )
                            .describe('Maturities by month')
                    })
                    .strict()
            )
            .describe('Maturities by kind of security')
    })
    .strict();

export const payloadQuerySchema = z.object({
    kind: z.enum(['month', 'cuts', 'portfolio']).describe('Which summary the payload is for'),
    month: z.string().optional().describe('Month, YYYY-MM, for month and cuts; defaults to the last closed month'),
    goalBps: z.coerce.number().int().min(0).max(MAX_GOAL_BPS).optional().describe('Simulated savings goal in basis points, for cuts'),
    contributionMinor: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_CONTRIBUTION_MINOR)
        .optional()
        .describe('Planned contribution in minor units, for portfolio')
});

export const payloadResponseSchema = z.object({
    kind: z.enum(['month', 'cuts', 'portfolio']).describe('Which summary the payload is for'),
    noticeVersion: z.number().int().describe('Current notice version'),
    payload: z
        .union([monthContextSchema, cutsContextSchema, portfolioContextSchema])
        .describe('Exactly the object sent to the language model, figures only')
});

export type PayloadQuery = z.infer<typeof payloadQuerySchema>;

export class PayloadQueryDto extends createZodDto(payloadQuerySchema) {}
