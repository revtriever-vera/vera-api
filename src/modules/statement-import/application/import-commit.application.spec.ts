import { describe, expect, it, vi } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { TransactionImportService } from '../../transactions/services/transaction-import.service';
import { TransactionIngestionService } from '../../transactions/services/transaction-ingestion.service';
import { TransactionFingerprintService } from '../../transactions/services/transaction-fingerprint.service';
import { CurrencyMismatchError, MappingRequiredError } from '../domain/statement-import.errors';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';
import { StatementParserService } from '../services/statement-parser.service';
import { ImportCommitApplication } from './import-commit.application';

const ACCOUNT = { id: 'acc-1', name: 'Nubank Cartão', currency: 'BRL' };

function view(overrides: Record<string, unknown> = {}) {
    return {
        id: 'imp-1',
        accountId: 'acc-1',
        format: 'ofx',
        fileName: 'nubank-cartao-1.02.ofx',
        rows: 4,
        inserted: 0,
        duplicates: 0,
        rejected: 0,
        periodStart: '2026-09-08',
        periodEnd: '2026-09-20',
        status: 'processing',
        isSample: false,
        createdAt: '2026-10-12T10:00:00.000Z',
        ...overrides
    };
}

function build(
    ingest: () => Promise<unknown> = () =>
        Promise.resolve({ inserted: 3, updated: 0, unchanged: 0, duplicates: 1, superseded: 0, rejected: 0 })
) {
    const imports = {
        record: vi.fn().mockResolvedValue(view()),
        finish: vi.fn((_id: string, counts: Record<string, unknown>) => view({ ...counts, status: counts['status'] ?? 'completed' })),
        undo: vi.fn().mockResolvedValue({ removed: 3 })
    };
    const ingestion = { ingest: vi.fn(ingest) };
    const accounts = {
        requireById: vi.fn().mockResolvedValue(ACCOUNT),
        createFileAccount: vi.fn().mockResolvedValue({ ...ACCOUNT, id: 'acc-new', name: 'Nova' }),
        removeFileAccount: vi.fn().mockResolvedValue(undefined)
    };
    const logs = { record: vi.fn(), rollbackFailed: vi.fn() };
    const metrics = { imported: vi.fn(), rows: vi.fn() };
    const application = new ImportCommitApplication(
        new StatementParserService(new TransactionFingerprintService()),
        imports as unknown as TransactionImportService,
        ingestion as unknown as TransactionIngestionService,
        accounts as unknown as FinancialAccountService,
        logs as unknown as StatementImportLogService,
        metrics as unknown as StatementImportMetricsService
    );
    return { application, imports, ingestion, accounts, logs, metrics };
}

const upload = (name: string) => ({ buffer: fixture(name), originalname: name, size: fixture(name).length });

describe('ImportCommitApplication', () => {
    it('grava na conta existente pelo ciclo record, ingest e finish, e conta duplicadas pelo que não entrou', async () => {
        const { application, imports, ingestion } = build();

        const result = await application.commit(upload('nubank-cartao-1.02.ofx'), { format: 'ofx', accountId: 'acc-1' });

        expect(imports.record).toHaveBeenCalledWith(
            expect.objectContaining({ accountId: 'acc-1', format: 'ofx', rows: 4, periodStart: '2026-09-08', periodEnd: '2026-09-20' })
        );
        expect(ingestion.ingest).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1', source: 'ofx', importId: 'imp-1' }));
        expect(result).toMatchObject({
            id: 'imp-1',
            accountName: 'Nubank Cartão',
            inserted: 3,
            duplicates: 1,
            rejected: 0,
            status: 'completed',
            rejections: []
        });
    });

    it('CSV entra com a fonte csv e linhas rejeitadas voltam com a razão e a linha', async () => {
        const { application, ingestion } = build();
        const bytes = Buffer.from('date,title,amount\n2026-09-01,ok,1.00\n2026-09-02,ruim,abc');

        const result = await application.commit(
            { buffer: bytes, originalname: 'x.csv', size: bytes.length },
            { format: 'csv_nubank_card', accountId: 'acc-1' }
        );

        expect(ingestion.ingest).toHaveBeenCalledWith(expect.objectContaining({ source: 'csv' }));
        expect(result.rejected).toBe(1);
        expect(result.rejections).toEqual([{ line: 3, reason: 'invalid_amount' }]);
    });

    it('cria a conta nova com o que o arquivo diz sobre ela', async () => {
        const { application, accounts } = build();

        await application.commit(upload('nubank-cartao-1.02.ofx'), {
            format: 'ofx',
            newAccountName: 'Nova',
            newAccountKind: 'credit_card'
        });

        expect(accounts.createFileAccount).toHaveBeenCalledWith({
            kind: 'credit_card',
            name: 'Nova',
            institutionName: 'Nubank',
            numberLast4: '4321',
            currency: 'BRL'
        });
        expect(accounts.requireById).not.toHaveBeenCalled();
    });

    it('a instituição informada vence a do arquivo', async () => {
        const { application, accounts } = build();

        await application.commit(upload('nubank-cartao-1.02.ofx'), {
            format: 'ofx',
            newAccountName: 'Nova',
            newAccountKind: 'checking',
            newAccountInstitution: 'Outra'
        });

        expect(accounts.createFileAccount).toHaveBeenCalledWith(expect.objectContaining({ institutionName: 'Outra' }));
    });

    it('CSV genérico sem mapping vira mapping_required antes de gravar qualquer coisa', async () => {
        const { application, imports, accounts } = build();

        await expect(
            application.commit(upload('generico-ponto-virgula.csv'), {
                format: 'csv_generic',
                newAccountName: 'N',
                newAccountKind: 'other'
            })
        ).rejects.toThrow(MappingRequiredError);
        expect(imports.record).not.toHaveBeenCalled();
        expect(accounts.createFileAccount).not.toHaveBeenCalled();
    });

    it('moeda do arquivo diferente da conta vira currency_mismatch', async () => {
        const { application, imports, accounts } = build();
        accounts.requireById.mockResolvedValue({ ...ACCOUNT, currency: 'USD' });

        await expect(application.commit(upload('nubank-cartao-1.02.ofx'), { format: 'ofx', accountId: 'acc-1' })).rejects.toThrow(
            CurrencyMismatchError
        );
        expect(imports.record).not.toHaveBeenCalled();
    });

    it('erro no meio desfaz o lote, marca failed e apaga a conta que acabou de criar', async () => {
        const { application, imports, accounts, logs, metrics } = build(() => Promise.reject(new Error('boom')));

        await expect(
            application.commit(upload('nubank-cartao-1.02.ofx'), { format: 'ofx', newAccountName: 'Nova', newAccountKind: 'other' })
        ).rejects.toThrow('boom');

        expect(imports.undo).toHaveBeenCalledWith('imp-1');
        expect(imports.finish).toHaveBeenCalledWith('imp-1', { inserted: 0, duplicates: 0, rejected: 0, status: 'failed' });
        expect(accounts.removeFileAccount).toHaveBeenCalledWith('acc-new');
        expect(logs.record).toHaveBeenCalledWith('failed', expect.objectContaining({ format: 'ofx' }));
        expect(metrics.imported).toHaveBeenCalledWith('ofx', 'failed');
    });

    it('erro com conta existente não apaga a conta', async () => {
        const { application, accounts } = build(() => Promise.reject(new Error('boom')));

        await expect(application.commit(upload('nubank-cartao-1.02.ofx'), { format: 'ofx', accountId: 'acc-1' })).rejects.toThrow('boom');
        expect(accounts.removeFileAccount).not.toHaveBeenCalled();
    });

    it('falha no rollback é registrada sem esconder o erro original', async () => {
        const { application, imports, accounts, logs } = build(() => Promise.reject(new Error('boom')));
        imports.undo.mockRejectedValue(new TypeError('x'));
        accounts.removeFileAccount.mockRejectedValue(new RangeError('y'));

        await expect(
            application.commit(upload('nubank-cartao-1.02.ofx'), { format: 'ofx', newAccountName: 'N', newAccountKind: 'other' })
        ).rejects.toThrow('boom');
        expect(logs.rollbackFailed).toHaveBeenCalledWith('imp-1', 'TypeError');
        expect(logs.rollbackFailed).toHaveBeenCalledWith('acc-new', 'RangeError');
    });

    it('registra log e métricas do que foi gravado', async () => {
        const { application, logs, metrics } = build();

        await application.commit(upload('nubank-cartao-1.02.ofx'), { format: 'ofx', accountId: 'acc-1' });

        expect(logs.record).toHaveBeenCalledWith('committed', expect.objectContaining({ importId: 'imp-1', inserted: 3, duplicates: 1 }));
        expect(metrics.rows).toHaveBeenCalledWith('ofx', { inserted: 3, duplicate: 1, rejected: 0 });
    });
});
