import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { StatementImportLogService } from './statement-import-log.service';
import { StatementImportMetricsService } from './statement-import-metrics.service';

describe('StatementImportLogService', () => {
    it('registra só contadores, formato e duração, nunca nome de arquivo, descrição ou valor', () => {
        const info = vi.fn();
        const service = new StatementImportLogService({ info, error: vi.fn() } as unknown as LogService);

        service.record('committed', {
            importId: 'i1',
            format: 'ofx',
            rows: 6,
            inserted: 4,
            duplicates: 2,
            rejected: 0,
            durationMs: 12,
            sizeBytes: 900
        });

        const entry = info.mock.calls[0]?.[0] as { identifier: string; meta: Record<string, unknown> };
        expect(entry.identifier).toBe('statement-import');
        expect(Object.keys(entry.meta).sort()).toEqual(
            ['action', 'durationMs', 'duplicates', 'format', 'importId', 'inserted', 'rejected', 'rows', 'sizeBytes'].sort()
        );
    });

    it('avisa falha de rollback só com o nome do erro', () => {
        const error = vi.fn();
        new StatementImportLogService({ info: vi.fn(), error } as unknown as LogService).rollbackFailed('i1', 'Error');

        expect(error.mock.calls[0]?.[0]).toMatchObject({ meta: { importId: 'i1', errorName: 'Error', action: 'failed' } });
    });
});

describe('StatementImportMetricsService', () => {
    it('conta importações por formato e resultado e linhas por desfecho, pulando zeros', () => {
        const count = vi.fn();
        const service = new StatementImportMetricsService({ count } as unknown as MetricsService);

        service.imported('ofx', 'committed');
        service.rows('ofx', { inserted: 4, duplicate: 2, rejected: 0 });

        expect(count.mock.calls).toEqual([
            ['vera_statement_imports_total', { format: 'ofx', result: 'committed' }],
            ['vera_statement_import_rows_total', { format: 'ofx', outcome: 'inserted' }, 4],
            ['vera_statement_import_rows_total', { format: 'ofx', outcome: 'duplicate' }, 2]
        ]);
    });
});
