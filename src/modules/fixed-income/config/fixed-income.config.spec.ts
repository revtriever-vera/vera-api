import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedIncomeConfig, FixedIncomeConfig } from './fixed-income.config';

describe('fixedIncomeConfig', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('usa o driver real e os códigos SGS padrão', () => {
        vi.stubEnv('FIXED_INCOME_INDEX_DRIVER', undefined);
        vi.stubEnv('SGS_CDI_SERIES_CODE', undefined);

        const config: FixedIncomeConfig = fixedIncomeConfig();

        expect(config.FIXED_INCOME_INDEX_DRIVER).toBe('bcb');
        expect(config.SGS_CDI_SERIES_CODE).toBe(12);
        expect(config.SGS_IPCA_SERIES_CODE).toBe(433);
        expect(config.SGS_MAX_ATTEMPTS).toBe(3);
    });

    it('fora do local o mock nunca é aceito', () => {
        vi.stubEnv('IS_LOCAL', 'false');
        vi.stubEnv('FIXED_INCOME_INDEX_DRIVER', 'mock');

        expect(fixedIncomeConfig().FIXED_INCOME_INDEX_DRIVER).toBe('bcb');
    });

    it('lê o driver e os códigos do ambiente', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('FIXED_INCOME_INDEX_DRIVER', 'mock');
        vi.stubEnv('SGS_CDI_SERIES_CODE', '4391');

        const config: FixedIncomeConfig = fixedIncomeConfig();

        expect(config.FIXED_INCOME_INDEX_DRIVER).toBe('mock');
        expect(config.SGS_CDI_SERIES_CODE).toBe(4391);
    });
});
