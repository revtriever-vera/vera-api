import { describe, expect, it, vi } from 'vitest';
import { RealRatesReaderService } from './real-rates-reader.service';
import { ScheduleSourceService } from './schedule-source.service';

describe('RealRatesReaderService', () => {
    it('sem índice de inflação não monta nenhum título, e devolve as taxas de referência lidas', async () => {
        const loadTitles = vi.fn().mockResolvedValue({
            today: '2026-03-20',
            series: { cdi: { dates: [], rates: [] }, ipca: { months: [], rates: [] } },
            titles: []
        });
        const reader = new RealRatesReaderService({ loadTitles } as unknown as ScheduleSourceService);

        const reading = await reader.readAll();

        expect(reading).toMatchObject({ asOf: '2026-03-20', items: [], rates: { ipca12m: null, cdiAnnual: null } });
    });
});
