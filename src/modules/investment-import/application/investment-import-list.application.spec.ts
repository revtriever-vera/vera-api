import { describe, expect, it, vi } from 'vitest';
import { FixedIncomeTitleImporterService } from '../../fixed-income/services/fixed-income-title-importer.service';
import { InvestmentImportReaderService } from '../../positions/services/investment-import-reader.service';
import { PositionOperationsService } from '../../positions/services/position-operations.service';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';
import { InvestmentImportListApplication } from './investment-import-list.application';

function record(id: string, operations: number) {
    return { id, source: 'b3', fileName: `${id}.xlsx`, status: 'completed', operations, createdAt: new Date('2026-10-12T10:00:00Z') };
}

describe('InvestmentImportListApplication.list', () => {
    it('traz a contagem de títulos de renda fixa de cada importação', async () => {
        const pagination = { page: 1, pageSize: 20, totalRecords: 2, totalPages: 1 };
        const records = { page: vi.fn().mockResolvedValue({ data: [record('a', 0), record('b', 3)], pagination }) };
        const titles = { countByImports: vi.fn().mockResolvedValue(new Map([['a', 4]])) };
        const app = new InvestmentImportListApplication(
            records as unknown as InvestmentImportReaderService,
            {} as PositionOperationsService,
            titles as unknown as FixedIncomeTitleImporterService,
            {} as InvestmentImportLogService,
            {} as InvestmentImportMetricsService
        );

        const result = await app.list(1, 20);

        expect(titles.countByImports).toHaveBeenCalledWith(['a', 'b']);
        expect(result.data.map((r) => [r.operations, r.fixedIncomeTitles])).toEqual([
            [0, 4],
            [3, 0]
        ]);
    });
});
