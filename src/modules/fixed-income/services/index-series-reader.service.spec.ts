import { describe, expect, it, vi } from 'vitest';
import { seriesOf } from '../../../../test/support/fixed-income-fixtures';
import { IndexSeriesDomain } from '../domain/index-series.domain';
import { IndexSeriesReaderService } from './index-series-reader.service';

describe('IndexSeriesReaderService', () => {
    it('entrega as séries de CDI e IPCA carregadas pelo domínio', async () => {
        const loaded = seriesOf([{ date: '2026-01-05', value: '0.05' }], [{ date: '2025-12-01', value: '0.4' }]);
        const loadCurveSeries = vi.fn().mockResolvedValue(loaded);
        const service = new IndexSeriesReaderService({ loadCurveSeries } as unknown as IndexSeriesDomain);

        await expect(service.loadCurveSeries()).resolves.toBe(loaded);
    });
});
