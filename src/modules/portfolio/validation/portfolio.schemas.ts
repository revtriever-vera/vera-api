import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const baseCurrencySchema = z
    .enum(['BRL', 'USD'])
    .describe('Base currency chosen in the portfolio preferences; every valueMinor is expressed in it');
const statusSchema = z
    .enum(['within', 'above', 'below'])
    .describe(
        'within: |deviation| is inside the tolerance; above: over target beyond the tolerance; below: under target beyond the tolerance'
    );
const bpsSchema = (description: string): z.ZodNumber => z.number().int().describe(description);
const minorSchema = (description: string): z.ZodNumber => z.number().int().describe(description);

const VALUE_SOURCE_VALUES = [
    'brapi',
    'finnhub',
    'twelvedata',
    'alphavantage',
    'coingecko',
    'tesouro_direto',
    'curve_cdi',
    'curve_pre',
    'curve_ipca'
] as const;

export const holdingSchema = z.object({
    kind: z
        .enum(['position', 'fixed_income'])
        .describe('position: asset valued by quantity x quote; fixed_income: title valued on its curve'),
    id: z.string().uuid().describe('Position id or fixed income title id, according to kind'),
    assetId: z.string().uuid().nullable().describe('Catalog asset id; null for fixed income'),
    symbol: z.string().describe('Ticker or title name'),
    name: z.string().describe('Asset or title name'),
    market: z.enum(['B3', 'US', 'CRYPTO', 'TESOURO']).nullable().describe('Market of the asset; null for fixed income'),
    typeGroup: z
        .enum(['fixed_income', 'tesouro', 'acoes_br', 'fii', 'acoes_eua', 'reits', 'cripto'])
        .describe('Kind of holding used to group and label it'),
    classId: z.string().uuid().nullable().describe('Asset class of the holding; null only for an orphan holding without assignment'),
    quantity: z.string().nullable().describe('Quantity held, decimal string; null for fixed income'),
    quantityDecimals: z.number().int().nullable().describe('Decimal places accepted in the quantity; null for fixed income'),
    unitPrice: z
        .string()
        .nullable()
        .describe('Latest quote price, decimal string in priceCurrency; null for fixed income or without quote'),
    priceCurrency: z.string().nullable().describe('Currency of the quote; null when unitPrice is null'),
    nativeValueMinor: minorSchema('Value in minor units of the native currency'),
    nativeCurrency: z.enum(['BRL', 'USD']).describe('Currency the asset is traded or the title is denominated in'),
    valueMinor: minorSchema('Value in minor units of the base currency; 0 when the quote or the exchange rate is missing'),
    valueSource: z.enum(VALUE_SOURCE_VALUES).describe('Where the value comes from: the quote provider or the fixed income curve'),
    priceDate: z.string().nullable().describe('Date of the quote, or the valuation date of the title (YYYY-MM-DD)'),
    dollarExposure: z.boolean().describe('True when the holding is quoted in USD or its asset has exposure to the dollar'),
    missingQuote: z.boolean().describe('No quote yet for an asset with quantity: value is 0 and a fetch was requested'),
    stale: z.boolean().describe('The quote is older than the freshness window of its market'),
    estimated: z.boolean().describe('Fixed income valuation uses projected index days'),
    matured: z.boolean().describe('The fixed income title has matured'),
    missingRate: z.boolean().describe('The exchange rate needed to convert to the base currency is missing: value is 0')
});

export const holdingsResponseSchema = z.object({
    baseCurrency: baseCurrencySchema,
    asOf: z.string().describe('Reference date of the calculation (YYYY-MM-DD, Brazil time zone)'),
    data: z.array(holdingSchema).describe('Holdings ordered by class sort order and, inside a class, by value descending')
});

const classBaseShape = {
    classId: z.string().uuid().describe('Asset class id'),
    systemKey: z.string().nullable().describe('Key of a default class; null for a user class'),
    name: z.string().nullable().describe('Name chosen by the user; null when the default name of the key applies'),
    displayName: z.string().describe('Name to show, resolved in the language of the request'),
    colorKey: z.string().describe('Color token of the class'),
    valueMinor: minorSchema('Value of the class in minor units of the base currency'),
    shareBps: bpsSchema('Share of the class in the total, in basis points; the shares add up to 10000'),
    targetBps: bpsSchema('Target share of the class, in basis points'),
    deviationBps: bpsSchema('shareBps minus targetBps; positive means over target'),
    status: statusSchema,
    gapMinor: minorSchema('Target value minus current value in minor units: positive is missing, negative is excess')
};

export const overviewClassSchema = z.object({
    ...classBaseShape,
    holdingsCount: z.number().int().describe('Number of holdings in the class')
});

export const overviewResponseSchema = z.object({
    baseCurrency: baseCurrencySchema,
    asOf: z.string().describe('Reference date of the calculation (YYYY-MM-DD, Brazil time zone)'),
    toleranceBps: bpsSchema('Tolerance band around the target, in basis points'),
    empty: z.boolean().describe('True when the portfolio has no holding'),
    totalMinor: minorSchema('Net worth in minor units of the base currency'),
    unclassifiedMinor: minorSchema('Value of holdings without class; the classes plus this value equal the total'),
    dollarExposure: z.object({
        valueMinor: minorSchema('Value of the holdings exposed to the dollar'),
        shareBps: bpsSchema('Exposure to the dollar as a share of the total, in basis points')
    }),
    usdRate: z
        .object({
            brlPerUnit: z.string().describe('Reais per US dollar, decimal string'),
            date: z.string().describe('Date of the exchange rate (YYYY-MM-DD)'),
            source: z.string().describe('Source of the exchange rate')
        })
        .nullable()
        .describe('Latest PTAX rate on or before today; null when none is stored'),
    classes: z.array(overviewClassSchema).describe('Every class of the company, even empty ones, by sort order'),
    outsideCount: z.number().int().describe('Number of classes outside the tolerance band'),
    largestDeviation: z
        .object({
            classId: z.string().uuid().describe('Class with the largest absolute deviation'),
            deviationBps: bpsSchema('Deviation of that class, in basis points'),
            gapMinor: minorSchema('Gap of that class in minor units'),
            status: statusSchema
        })
        .nullable()
        .describe('Null when the portfolio has no value'),
    quality: z.object({
        missingQuotes: z.number().int().describe('Holdings served without quote'),
        staleQuotes: z.number().int().describe('Holdings served with an old quote'),
        estimatedFixedIncome: z.number().int().describe('Fixed income titles valued with projected index days'),
        indexDataMissing: z.number().int().describe('Fixed income titles whose index data is not available yet'),
        missingRates: z.number().int().describe('Holdings that could not be converted for lack of exchange rate')
    })
});

export const classDetailAssetSchema = z.object({
    kind: z.enum(['position', 'fixed_income']).describe('Kind of holding'),
    id: z.string().uuid().describe('Position id or fixed income title id'),
    assetId: z.string().uuid().nullable().describe('Catalog asset id; null for fixed income'),
    symbol: z.string().describe('Ticker or title name'),
    name: z.string().describe('Asset or title name'),
    valueMinor: minorSchema('Value in minor units of the base currency'),
    shareInClassBps: bpsSchema('Share of the holding inside its class, in basis points'),
    targetInClassBps: bpsSchema('Effective target inside the class: the stored one, or an equal split when none is set'),
    deviationBps: bpsSchema('shareInClassBps minus targetInClassBps'),
    status: statusSchema,
    gapMinor: minorSchema('Target value minus current value inside the class, in minor units'),
    isZeroQuantity: z.boolean().describe('The position exists with quantity zero'),
    missingQuote: z.boolean().describe('No quote yet for the asset'),
    stale: z.boolean().describe('The quote is old')
});

export const classDetailResponseSchema = z.object({
    class: z.object(classBaseShape),
    baseCurrency: baseCurrencySchema,
    toleranceBps: bpsSchema('Tolerance band, in basis points'),
    targetsSumBps: bpsSchema('Sum of the targets stored inside the class; 0 means the split is equal'),
    assets: z.array(classDetailAssetSchema).describe('Holdings of the class by value descending')
});

export const classIdParamsSchema = z.object({
    classId: z.string().uuid().describe('Asset class id')
});

export type HoldingResponse = z.infer<typeof holdingSchema>;
export type HoldingsResponse = z.infer<typeof holdingsResponseSchema>;
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
export type ClassDetailResponse = z.infer<typeof classDetailResponseSchema>;

export class ClassIdParamsDto extends createZodDto(classIdParamsSchema) {}
