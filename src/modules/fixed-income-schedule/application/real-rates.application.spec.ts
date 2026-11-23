import { describe, expect, it, vi } from 'vitest';
import { seriesOf } from '../../../../test/support/fixed-income-fixtures';
import { flatSeries, makeScheduleTitle, TODAY } from '../../../../test/support/schedule-fixtures';
import { ScheduleIndexDataMissingError } from '../domain/schedule.errors';
import { ScheduleLogService } from '../services/schedule-log.service';
import { ScheduleMetricsService } from '../services/schedule-metrics.service';
import { ScheduleSourceService } from '../services/schedule-source.service';
import { RealRatesApplication } from './real-rates.application';

function build(series = flatSeries()) {
    const loadTitles = vi.fn().mockResolvedValue({ today: TODAY, series, titles: [makeScheduleTitle()] });
    const referenceMissing = vi.fn();
    const realRates = vi.fn();
    const application = new RealRatesApplication(
        { loadTitles } as unknown as ScheduleSourceService,
        { referenceMissing } as unknown as ScheduleLogService,
        { realRates } as unknown as ScheduleMetricsService
    );
    return { application, referenceMissing, realRates };
}

describe('RealRatesApplication', () => {
    it('devolve a referência do IPCA e uma linha por título', async () => {
        const doubles = build();

        const response = await doubles.application.list();

        expect(response.asOf).toBe(TODAY);
        expect(response.reference.ipcaMonth).toBe('2025-12');
        expect(response.items).toHaveLength(1);
        expect(doubles.realRates).toHaveBeenCalledWith('ok');
    });

    it('sem série de IPCA responde 503 fixed_income.index_data_missing', async () => {
        const doubles = build(seriesOf([{ date: '2026-01-02', value: '0.05' }]));

        const failure = await doubles.application.list().catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ScheduleIndexDataMissingError);
        expect(failure).toMatchObject({ code: 'fixed_income.index_data_missing', status: 503 });
        expect(doubles.referenceMissing).toHaveBeenCalledWith('real_rates', false, true);
        expect(doubles.realRates).toHaveBeenCalledWith('index_data_missing');
    });
});
