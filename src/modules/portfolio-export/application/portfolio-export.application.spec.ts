import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { holdingOf, snapshotOf } from '../domain/export-fixtures';
import { PortfolioExportLogService } from '../services/portfolio-export-log.service';
import { PortfolioExportMetricsService } from '../services/portfolio-export-metrics.service';
import { PortfolioExportApplication } from './portfolio-export.application';

function build() {
    const logs = { exported: vi.fn() };
    const metrics = { exported: vi.fn() };
    const xlsx = { write: vi.fn().mockResolvedValue(Buffer.from('xlsx-bytes')) };
    const application: PortfolioExportApplication = new PortfolioExportApplication(
        {
            build: vi.fn().mockResolvedValue(snapshotOf([holdingOf({}), holdingOf({ symbol: 'PETR4' })]))
        } as unknown as PortfolioSnapshotService,
        xlsx,
        { todayInCompany: vi.fn().mockResolvedValue('2026-10-11') } as unknown as CompanyTimezoneService,
        { get: vi.fn().mockReturnValue({ requestId: 'req', locale: 'pt-BR' }) } as unknown as AppContext,
        logs as unknown as PortfolioExportLogService,
        metrics as unknown as PortfolioExportMetricsService
    );
    return { application, logs, metrics, xlsx };
}

describe('PortfolioExportApplication', () => {
    it('builds the csv file with the company date in the name and records log and metric', async () => {
        const { application, logs, metrics, xlsx } = build();

        const file = await application.export('csv');

        expect(file).toMatchObject({ filename: 'vera-carteira-2026-10-11.csv', contentType: 'text/csv; charset=utf-8', rows: 2 });
        expect(file.content.toString('utf8').startsWith('﻿Ativo;')).toBe(true);
        expect(xlsx.write).not.toHaveBeenCalled();
        expect(logs.exported).toHaveBeenCalledWith('csv', 2, expect.any(Number));
        expect(metrics.exported).toHaveBeenCalledWith('csv');
    });

    it('delegates the xlsx file to the writer', async () => {
        const { application, xlsx } = build();

        const file = await application.export('xlsx');

        expect(file.filename).toBe('vera-carteira-2026-10-11.xlsx');
        expect(file.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(file.content.toString()).toBe('xlsx-bytes');
        expect(xlsx.write).toHaveBeenCalledOnce();
    });
});
