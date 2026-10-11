import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BASE_CURRENCIES, MAX_TOLERANCE_BPS } from '../domain/allocation.types';

const baseCurrencySchema = z.nativeEnum(BASE_CURRENCIES).describe('Base currency of the portfolio: `BRL` or `USD`');

const toleranceBpsSchema = z
    .number()
    .int()
    .min(0)
    .max(MAX_TOLERANCE_BPS)
    .describe(
        'Tolerance band in basis points (500 = 5 percentage points), 0 to 2000. A deviation with absolute value <= tolerance is "within"'
    );

export const portfolioSettingsSchema = z.object({
    baseCurrency: baseCurrencySchema,
    toleranceBps: toleranceBpsSchema
});

export const updatePortfolioSettingsSchema = z
    .object({
        baseCurrency: baseCurrencySchema.optional(),
        toleranceBps: toleranceBpsSchema.optional()
    })
    .strict();

export class UpdatePortfolioSettingsDto extends createZodDto(updatePortfolioSettingsSchema) {}
