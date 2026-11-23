import { describe, expect, it, vi } from 'vitest';
import { flatSeries, makeScheduleTitle, TODAY } from '../../../../test/support/schedule-fixtures';
import { seriesOf } from '../../../../test/support/fixed-income-fixtures';
import { ScheduleLogService } from '../services/schedule-log.service';
import { ScheduleMetricsService } from '../services/schedule-metrics.service';
import { ScheduleSourceService } from '../services/schedule-source.service';
import { MaturitiesApplication } from './maturities.application';

function build(series = flatSeries()) {
    const load = vi.fn().mockResolvedValue({ today: TODAY, series, usdRate: null, titles: [makeScheduleTitle()], treasuries: [] });
    const referenceMissing = vi.fn();
    const maturities = vi.fn();
    const application = new MaturitiesApplication(
        { load } as unknown as ScheduleSourceService,
        { referenceMissing } as unknown as ScheduleLogService,
        { maturities } as unknown as ScheduleMetricsService
    );
    return { application, load, referenceMissing, maturities };
}

describe('MaturitiesApplication', () => {
    it('devolve as taxas de referência usadas e as linhas', async () => {
        const doubles = build();

        const response = await doubles.application.list(10);

        expect(response.asOf).toBe(TODAY);
        expect(response.reference).toMatchObject({ cdiDate: '2026-01-02', ipcaMonth: '2025-12' });
        expect(response.reference.cdiAnnualBps).toBeGreaterThan(0);
        expect(response.items).toHaveLength(1);
        expect(doubles.referenceMissing).not.toHaveBeenCalled();
        expect(doubles.maturities).toHaveBeenCalledWith('ok');
    });

    it('sem séries avisa, conta e devolve a referência nula com as linhas estimadas', async () => {
        const doubles = build(seriesOf([]));

        const response = await doubles.application.list(10);

        expect(response.reference).toEqual({ cdiAnnualBps: null, ipca12mBps: null, cdiDate: null, ipcaMonth: null });
        expect(response.items).toHaveLength(1);
        expect(doubles.referenceMissing).toHaveBeenCalledWith('maturities', true, true);
        expect(doubles.maturities).toHaveBeenCalledWith('index_data_missing');
    });
});
