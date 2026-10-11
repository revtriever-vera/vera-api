import { describe, expect, it, vi } from 'vitest';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { TransactionImportService } from '../../transactions/services/transaction-import.service';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';
import { ImportListApplication } from './import-list.application';

const VIEW = {
    id: 'imp-1',
    accountId: 'acc-1',
    format: 'ofx',
    fileName: 'x.ofx',
    rows: 6,
    inserted: 4,
    duplicates: 2,
    rejected: 0,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    status: 'completed',
    isSample: false,
    createdAt: '2026-10-12T10:00:00.000Z'
};

function build() {
    const imports = {
        list: vi.fn().mockResolvedValue({ data: [VIEW], pagination: { page: 1, pageSize: 50, totalRecords: 1, totalPages: 1 } }),
        find: vi.fn().mockResolvedValue(VIEW),
        undo: vi.fn().mockResolvedValue({ removed: 4 })
    };
    const accounts = { list: vi.fn().mockResolvedValue([{ id: 'acc-1', name: 'Nubank Cartão' }]) };
    const logs = { record: vi.fn() };
    const metrics = { imported: vi.fn() };
    const application = new ImportListApplication(
        imports as unknown as TransactionImportService,
        accounts as unknown as FinancialAccountService,
        logs as unknown as StatementImportLogService,
        metrics as unknown as StatementImportMetricsService
    );
    return { application, imports, logs, metrics };
}

describe('ImportListApplication', () => {
    it('lista os lotes com o nome da conta e sem o campo de exemplo', async () => {
        const { application, imports } = build();

        const page = await application.list(2, 20);

        expect(imports.list).toHaveBeenCalledWith(2, 20);
        expect(page.data[0]).toMatchObject({ id: 'imp-1', accountName: 'Nubank Cartão', inserted: 4, duplicates: 2 });
        expect(page.data[0]).not.toHaveProperty('isSample');
        expect(page.pagination.totalRecords).toBe(1);
    });

    it('desfaz o lote e devolve quantas linhas saíram', async () => {
        const { application, imports, logs, metrics } = build();

        await expect(application.undo('imp-1')).resolves.toEqual({ removed: 4 });

        expect(imports.undo).toHaveBeenCalledWith('imp-1');
        expect(logs.record).toHaveBeenCalledWith('undone', expect.objectContaining({ importId: 'imp-1', format: 'ofx' }));
        expect(metrics.imported).toHaveBeenCalledWith('ofx', 'undone');
    });

    it('nome de conta ausente vira texto vazio em vez de quebrar', async () => {
        const { application, imports } = build();
        imports.list.mockResolvedValue({
            data: [{ ...VIEW, accountId: 'outra' }],
            pagination: { page: 1, pageSize: 50, totalRecords: 1, totalPages: 1 }
        });

        expect((await application.list(1, 50)).data[0]?.accountName).toBe('');
    });
});
