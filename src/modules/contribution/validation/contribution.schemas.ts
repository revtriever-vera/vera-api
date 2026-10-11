import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MAX_CONTRIBUTION_MINOR } from '../domain/contribution.types';

const minorSchema = (description: string): z.ZodNumber => z.number().int().describe(description);
const bpsSchema = (description: string): z.ZodNumber => z.number().int().describe(description);

export const suggestRequestSchema = z.object({
    amountMinor: z
        .number()
        .int()
        .min(1)
        .max(MAX_CONTRIBUTION_MINOR)
        .describe('Contribution in minor units of the base currency of the portfolio, from 1 to 100,000,000,000')
});

export const assetSuggestionSchema = z.object({
    kind: z.enum(['position', 'fixed_income']).describe('position: asset valued by quantity x quote; fixed_income: title'),
    id: z.string().uuid().describe('Position id or fixed income title id, according to kind'),
    assetId: z.string().uuid().nullable().describe('Catalog asset id; null for fixed income'),
    typeGroup: z
        .enum(['fixed_income', 'tesouro', 'acoes_br', 'fii', 'acoes_eua', 'reits', 'cripto'])
        .describe('Kind of holding used to group and label it'),
    symbol: z.string().describe('Ticker or title name'),
    name: z.string().describe('Asset or title name'),
    amountMinor: minorSchema('Suggested amount for this holding, in minor units of the base currency'),
    approxUnits: z
        .string()
        .nullable()
        .describe(
            'Approximate quantity the amount buys, decimal string rounded down to the decimals the asset accepts; "0" when it does not buy one unit; null for fixed income or without quote or exchange rate'
        ),
    unitPrice: z
        .string()
        .nullable()
        .describe('Latest quote price, decimal string in priceCurrency; null for fixed income or without quote'),
    priceCurrency: z.string().nullable().describe('Currency of the quote; null when unitPrice is null'),
    shareInClassBeforeBps: bpsSchema('Share of the holding inside its class before the contribution, in basis points'),
    shareInClassAfterBps: bpsSchema('Share of the holding inside its class after the contribution, in basis points'),
    targetInClassBps: bpsSchema('Effective target inside the class, in basis points')
});

export const classSuggestionSchema = z.object({
    classId: z.string().uuid().describe('Asset class id'),
    systemKey: z.string().nullable().describe('Key of a default class; null for a user class'),
    name: z.string().nullable().describe('Name chosen by the user; null when the default name of the key applies'),
    colorKey: z.string().describe('Color token of the class'),
    amountMinor: minorSchema('Suggested amount for the class, in minor units of the base currency'),
    valueBeforeMinor: minorSchema('Value of the class before the contribution, in minor units'),
    shareBeforeBps: bpsSchema('Share of the class in the total before the contribution, in basis points'),
    shareAfterBps: bpsSchema('Share of the class in the total after the contribution, in basis points'),
    targetBps: bpsSchema('Target share of the class, in basis points'),
    note: z.enum(['no_assets']).nullable().describe('no_assets: the class got money but has no holding that can receive it'),
    assets: z
        .array(assetSuggestionSchema)
        .describe('Holdings that receive money, by amount descending; the amounts add up to the class amount')
});

export const suggestResponseSchema = z.object({
    baseCurrency: z.enum(['BRL', 'USD']).describe('Base currency of the portfolio; every amount is expressed in its minor unit'),
    amountMinor: minorSchema('The contribution that was distributed'),
    totalBeforeMinor: minorSchema('Net worth before the contribution'),
    totalAfterMinor: minorSchema('Net worth after the contribution'),
    warnings: z.array(z.enum(['class_targets_not_100'])).describe('class_targets_not_100: the class targets do not add up to 100%'),
    classes: z
        .array(classSuggestionSchema)
        .describe('Only classes that receive money, by amount descending; the amounts add up to amountMinor')
});

export type SuggestRequest = z.infer<typeof suggestRequestSchema>;
export type SuggestResponse = z.infer<typeof suggestResponseSchema>;

export class SuggestRequestDto extends createZodDto(suggestRequestSchema) {}
