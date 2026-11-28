import { describe, expect, it, vi } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { TransactionImportService } from '../../transactions/services/transaction-import.service';
import { TransactionFingerprintService } from '../../transactions/services/transaction-fingerprint.service';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';
import { StatementModelPreviewService } from '../services/statement-model-preview.service';
import { StatementParserService } from '../services/statement-parser.service';
import { ImportPreviewApplication } from './import-preview.application';

function build(previous: { createdAt: string } | null = null) {
    const imports = { findCompletedByHash: vi.fn().mockResolvedValue(previous) };
    const accounts = {
        list: vi.fn().mockResolvedValue([{ id: 'acc-1', name: 'Itaú', institutionName: 'Itaú', numberLast4: '5678' }])
    };
    const logs = { record: vi.fn() };
    const metrics = { imported: vi.fn() };
    const models = { accepts: vi.fn().mockReturnValue(false), preview: vi.fn(), expire: vi.fn() };
    const application = new ImportPreviewApplication(
        new StatementParserService(new TransactionFingerprintService()),
        imports as unknown as TransactionImportService,
        accounts as unknown as FinancialAccountService,
        models as unknown as StatementModelPreviewService,
        logs as unknown as StatementImportLogService,
        metrics as unknown as StatementImportMetricsService
    );
    return { application, imports, accounts, logs, metrics, models };
}

const upload = (name: string, originalname: string = name) => ({ buffer: fixture(name), originalname, size: fixture(name).length });

describe('ImportPreviewApplication', () => {
    it('devolve formato, período, amostra, dica e a conta sugerida', async () => {
        const { application } = build();

        const preview = await application.preview(upload('itau-conta-1.02.ofx', '/tmp/x/extrato.ofx'), {});

        expect(preview).toMatchObject({
            detectedFormat: 'ofx',
            format: 'ofx',
            fileName: 'extrato.ofx',
            rows: 4,
            rejected: 0,
            periodStart: '2026-09-05',
            periodEnd: '2026-09-12',
            currency: 'BRL',
            accountHint: { institution: 'Itaú', numberLast4: '5678' },
            suggestedAccountId: 'acc-1',
            alreadyImportedAt: null
        });
        expect(preview.sample).toHaveLength(4);
    });

    it('avisa quando o mesmo arquivo já foi importado', async () => {
        const { application, imports } = build({ createdAt: '2026-10-01T10:00:00.000Z' });

        const preview = await application.preview(upload('nubank-conta.csv'), {});

        expect(preview.alreadyImportedAt).toBe('2026-10-01T10:00:00.000Z');
        expect(imports.findCompletedByHash).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
    });

    it('não consulta contas quando o arquivo não diz nada sobre a conta', async () => {
        const { application, accounts } = build();

        const preview = await application.preview(upload('nubank-conta.csv'), {});

        expect(preview.suggestedAccountId).toBeNull();
        expect(accounts.list).not.toHaveBeenCalled();
    });

    it('CSV genérico sem mapping devolve as colunas', async () => {
        const { application } = build();

        const preview = await application.preview(upload('generico-ponto-virgula.csv'), {});

        expect(preview).toMatchObject({ format: 'csv_generic', columns: ['Data', 'Histórico', 'Valor'], rows: 4, sample: [] });
    });

    it('registra log e métrica sem conteúdo do arquivo', async () => {
        const { application, logs, metrics } = build();

        await application.preview(upload('nubank-cartao.csv'), {});

        expect(JSON.stringify(logs.record.mock.calls)).not.toContain('nubank-cartao');
        expect(logs.record.mock.calls[0]?.[0]).toBe('previewed');
        expect(metrics.imported).toHaveBeenCalledWith('csv_nubank_card', 'previewed');
    });

    it('PDF ou imagem vai para a leitura pelo modelo com o consentimento do pedido, e o texto fica de fora', async () => {
        const { application, models, imports } = build();
        models.accepts.mockReturnValue(true);
        models.preview.mockResolvedValue({ format: 'model' });
        const pdf = { buffer: Buffer.from('%PDF-1.4'), originalname: 'extrato.pdf', size: 8 };

        const preview = await application.preview(pdf, { modelConsent: true });
        await application.preview(pdf, {});

        expect(preview).toEqual({ format: 'model' });
        expect(models.preview.mock.calls.map((call: unknown[]) => call[1])).toEqual([true, false]);
        expect(imports.findCompletedByHash).not.toHaveBeenCalled();
    });

    it('expire repassa o id da prévia', async () => {
        const { application, models } = build();

        await application.expire('p-1');

        expect(models.expire).toHaveBeenCalledWith('p-1');
    });
});
