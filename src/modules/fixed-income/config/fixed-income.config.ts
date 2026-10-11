import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { DEFAULT_SGS_CODES, INDEX_SERIES } from '../domain/index-series';

const schema = z.object({
    FIXED_INCOME_INDEX_DRIVER: z.enum(['bcb', 'mock']).default('bcb'),
    SGS_BASE_URL: z.string().url().default('https://api.bcb.gov.br'),
    SGS_CDI_SERIES_CODE: z.coerce.number().int().positive().default(DEFAULT_SGS_CODES[INDEX_SERIES.cdiDaily]),
    SGS_IPCA_SERIES_CODE: z.coerce.number().int().positive().default(DEFAULT_SGS_CODES[INDEX_SERIES.ipcaMonthly]),
    SGS_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    SGS_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    SGS_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(500)
});

export type FixedIncomeConfig = z.infer<typeof schema>;

export const fixedIncomeConfig = registerAs('fixedIncome', (): FixedIncomeConfig => schema.parse(process.env));
