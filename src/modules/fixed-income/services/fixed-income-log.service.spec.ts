import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { FixedIncomeLogService } from './fixed-income-log.service';

function build() {
    const info = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    return { service: new FixedIncomeLogService({ info, warn, error } as unknown as LogService), info, warn, error };
}

describe('FixedIncomeLogService', () => {
    it('registra só ids e enumerações do título, nunca nome, valor ou taxa', () => {
        const doubles = build();

        doubles.service.titleChanged('created', 'title-1', 'cdb', 'cdi_percent');

        expect(doubles.info).toHaveBeenCalledWith({
            message: 'fixed income title changed',
            identifier: 'fixed-income-title',
            meta: { action: 'created', titleId: 'title-1', kind: 'cdb', indexer: 'cdi_percent' }
        });
    });

    it('registra a sincronização das séries', () => {
        const doubles = build();

        doubles.service.seriesSynced('cdi_daily', '2026-01-01', '2026-10-11', 5);
        doubles.service.syncRequested('cdi_daily', 2);
        doubles.service.seriesSyncFailed('cdi_daily', '2026-01-01', '2026-10-11', new Error('x'));

        expect(doubles.info).toHaveBeenCalledWith(
            expect.objectContaining({
                identifier: 'fixed-income-index-sync',
                meta: { series: 'cdi_daily', from: '2026-01-01', to: '2026-10-11', points: 5 }
            })
        );
        expect(doubles.info).toHaveBeenCalledWith(expect.objectContaining({ meta: { series: 'cdi_daily', windows: 2 } }));
        expect(doubles.error).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'fixed-income-index-sync' }));
    });

    it('avisa quando falta dado de índice', () => {
        const doubles = build();

        doubles.service.valuationMissingData(3, '2026-10-09');

        expect(doubles.warn).toHaveBeenCalledWith({
            message: 'index data does not cover fixed income titles',
            identifier: 'fixed-income-valuation',
            meta: { status: 'index_data_missing', titles: 3, seriesLastDate: '2026-10-09' }
        });
    });
});
