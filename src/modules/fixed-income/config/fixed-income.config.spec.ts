import { afterEach, describe, expect, it } from 'vitest';
import { fixedIncomeConfig, FixedIncomeConfig } from './fixed-income.config';

const ORIGINAL_ENV: NodeJS.ProcessEnv = { ...process.env };

describe('fixedIncomeConfig', () => {
    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('usa o driver real e os códigos SGS padrão', () => {
        delete process.env['FIXED_INCOME_INDEX_DRIVER'];
        delete process.env['SGS_CDI_SERIES_CODE'];

        const config: FixedIncomeConfig = fixedIncomeConfig();

        expect(config.FIXED_INCOME_INDEX_DRIVER).toBe('bcb');
        expect(config.SGS_CDI_SERIES_CODE).toBe(12);
        expect(config.SGS_IPCA_SERIES_CODE).toBe(433);
        expect(config.SGS_MAX_ATTEMPTS).toBe(3);
    });

    it('lê o driver e os códigos do ambiente', () => {
        process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';
        process.env['SGS_CDI_SERIES_CODE'] = '4391';

        const config: FixedIncomeConfig = fixedIncomeConfig();

        expect(config.FIXED_INCOME_INDEX_DRIVER).toBe('mock');
        expect(config.SGS_CDI_SERIES_CODE).toBe(4391);
    });
});
