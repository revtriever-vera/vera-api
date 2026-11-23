import { z } from 'zod';

const minor = (description: string): z.ZodNumber => z.number().int().describe(description);
const bps = (description: string): z.ZodNumber => z.number().int().describe(description);

const assetsSchema = z.array(z.string()).describe('Names of up to 4 assets in the row, largest first. Untrusted text');
const moreCountSchema = z.number().int().describe('Number of assets in the row beyond the ones listed in assets');

export const issuerRowSchema = z.object({
    key: z
        .string()
        .describe(
            'Issuer group id (kind group) or a fixed bucket key (kind bucket): missing_issuer, funds, crypto, unmapped. The front translates the bucket keys'
        ),
    kind: z.enum(['group', 'bucket']).describe('group: issuer group from the curated list; bucket: fixed bucket without a single issuer'),
    name: z.string().nullable().describe('Group name when kind is group; null for a bucket'),
    valueMinor: minor('Sum of the holdings of the row, in base currency minor units'),
    shareBps: bps('Share of the total net worth in basis points; the rows plus byIssuerOthers sum to 10000'),
    assets: assetsSchema,
    moreCount: moreCountSchema
});

export const issuerOthersSchema = z.object({
    valueMinor: minor('Sum of the groups beyond the top 10, in base currency minor units'),
    shareBps: bps('Share of the total net worth in basis points'),
    groups: z.number().int().describe('Number of groups and buckets beyond the top 10')
});

export const sectorRowSchema = z.object({
    key: z.string().describe('Sector key from the closed sector list, or unmapped_sector when the asset has no sector in the catalog'),
    valueMinor: minor('Sum of the equity holdings of the sector, in base currency minor units'),
    shareBps: bps('Share of the equity total in basis points; the rows sum to 10000'),
    assets: assetsSchema,
    moreCount: moreCountSchema
});

export const concentrationResponseSchema = z.object({
    asOf: z.string().describe('Reference date of the portfolio, YYYY-MM-DD'),
    baseCurrency: z.enum(['BRL', 'USD']).describe('Base currency of every valueMinor'),
    totalMinor: minor(
        'Net worth counted in the concentration (open positions and fixed income not yet matured), in base currency minor units'
    ),
    equityTotalMinor: minor(
        'Value of the holdings of the equity classes (Brazilian stocks, US stocks, FII, REITs), in base currency minor units'
    ),
    byIssuer: z.array(issuerRowSchema).describe('Top 10 issuer groups and buckets by value, largest first'),
    byIssuerOthers: issuerOthersSchema.nullable().describe('Everything beyond the top 10; null when there are 10 rows or fewer'),
    bySector: z.array(sectorRowSchema).describe('Sectors of the equity holdings, largest first')
});

export type ConcentrationResponse = z.infer<typeof concentrationResponseSchema>;
