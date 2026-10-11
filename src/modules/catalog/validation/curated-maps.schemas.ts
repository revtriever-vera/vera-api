import { z } from 'zod';
import { CLASS_KEYS } from '../domain/catalog.types';

export const curatedEntrySchema = z
    .object({
        symbol: z.string().regex(/^[A-Z0-9.-]{1,12}$/),
        classKey: z.nativeEnum(CLASS_KEYS).nullable(),
        dollarExposure: z.boolean()
    })
    .strict();

export const curatedMapSchema = z.array(curatedEntrySchema);

export type CuratedEntry = z.infer<typeof curatedEntrySchema>;

export const popularAssetsSchema = z.record(
    z.string(),
    z.array(z.object({ market: z.enum(['B3', 'US', 'CRYPTO', 'TESOURO']), externalId: z.string().min(1) }).strict())
);

export type PopularAssets = z.infer<typeof popularAssetsSchema>;

export const seedAssetSchema = z
    .object({
        market: z.enum(['B3', 'US', 'CRYPTO', 'TESOURO']),
        externalId: z.string().min(1),
        symbol: z.string().min(1),
        name: z.string().min(1),
        kind: z.enum(['stock', 'etf', 'fii', 'bdr', 'reit', 'crypto', 'treasury']),
        currency: z.enum(['BRL', 'USD']),
        maturityDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        rank: z.number().int().positive().optional()
    })
    .strict();

export const seedAssetsSchema = z.array(seedAssetSchema);

export type SeedAsset = z.infer<typeof seedAssetSchema>;
