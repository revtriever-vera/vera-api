import { AddressInfo, Server } from 'node:net';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LlmDriverCall } from '../../src/core/llm/drivers/llm-driver';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { LogService } from '../../src/core/observability/log.service';
import { ImportPreviewApplication } from '../../src/modules/statement-import/application/import-preview.application';
import { Account, AllocationHarness } from './support/allocation-harness';

interface Reply {
    readonly status: number;
    readonly body: Record<string, unknown>;
}

interface ModelBody {
    readonly previewId: string;
    readonly expiresAt: string;
    readonly transactions: { line: number; date: string; description: string; amountMinor: number }[];
    readonly pagesNotRead: string[];
}

const HOLDER: string = 'TITULAR SENTINELA EXTRATO QZ';
const DOCUMENT: string = '111.222.333-96';
const ACCOUNT_NUMBER: string = '98765-4';
const MERCHANT: string = 'PADARIA SENTINELA MODELO';
const PAYEE: string = 'FULANA SENTINELA PIX';

async function statementPdf(marker: string): Promise<Buffer> {
    const document: PDFDocument = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage([595, 842]);
    const lines: string[] = [
        `BANCO EXEMPLO - EXTRATO ${marker}`,
        `Cliente: ${HOLDER}`,
        `CPF: ${DOCUMENT}`,
        `Agencia: 0001 Conta: ${ACCOUNT_NUMBER}`,
        'Periodo: 01/10/2026 a 31/10/2026',
        '01/10/2026 SALARIO EMPRESA EXEMPLO 5.000,00',
        `03/10/2026 ${MERCHANT} -12,90`,
        `05/10/2026 PIX ENVIADO ${PAYEE} -150,00`,
        'Saldo final 4.837,10'
    ];
    lines.forEach((line: string, row: number): void => {
        page.drawText(line, { x: 20, y: 800 - row * 14, size: 10, font });
    });
    return Buffer.from(await document.save());
}

function modelAnswer(transactions: unknown[]): string {
    return JSON.stringify({ currency: 'BRL', institution: 'Banco Exemplo', accountLast4: null, transactions });
}

const READ_TRANSACTIONS: unknown[] = [
    { date: '2026-10-01', description: 'SALARIO EMPRESA EXEMPLO', amountMinor: 500000 },
    { date: '2026-10-03', description: MERCHANT, amountMinor: -1290 },
    { date: '2026-10-05', description: `PIX ENVIADO ${PAYEE}`, amountMinor: -15000 }
];

describe('statement import read by the model', () => {
    let harness: AllocationHarness;
    let origin: string;
    let mock: MockLlmDriver;
    let sent: LlmDriverCall[];
    const logged: string[] = [];

    beforeAll(async () => {
        harness = await AllocationHarness.start('statement_import_model');
        const address: AddressInfo = (harness.app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
        mock = harness.app.get(MockLlmDriver, { strict: false });
        sent = [];
        const original = mock.generate.bind(mock);
        vi.spyOn(mock, 'generate').mockImplementation(async (call: LlmDriverCall) => {
            sent.push(call);
            return original(call);
        });
        const logs: LogService = harness.app.get(LogService, { strict: false });
        for (const level of ['info', 'warn', 'error', 'debug'] as const) {
            const keep = logs[level].bind(logs);
            vi.spyOn(logs, level).mockImplementation((entry) => {
                logged.push(JSON.stringify(entry));
                keep(entry);
            });
        }
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function upload(
        account: Account,
        file: Buffer,
        fields: Record<string, string> = {},
        name: string = 'extrato.pdf'
    ): Promise<Reply> {
        const form: FormData = new FormData();
        for (const [key, value] of Object.entries(fields)) {
            form.append(key, value);
        }
        form.append('file', new Blob([new Uint8Array(file)]), name);
        const response: Response = await fetch(`${origin}/spending/imports/preview`, {
            method: 'POST',
            body: form,
            headers: { authorization: `Bearer ${account.token}` }
        });
        return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    }

    async function rows<T>(query: string, params: unknown[]): Promise<T[]> {
        return (await harness.pg.query(query, params)).rows as T[];
    }

    it('sem modelConsent o PDF responde 428 com o aviso de que as descrições vão junto, e nada vai ao modelo', async () => {
        const owner: Account = await harness.signUp('model_consent');
        const before: number = sent.length;

        const reply: Reply = await upload(owner, await statementPdf('A'));

        expect(reply.status).toBe(428);
        expect(reply.body).toMatchObject({
            type: 'imports.model_confirmation_required',
            meta: { includes: ['transaction_descriptions'], mayContain: ['merchant_names', 'person_names'] }
        });
        expect(sent).toHaveLength(before);
        expect(await rows('SELECT 1 FROM "StatementImportPreviews" WHERE "companyId" = $1', [owner.company.id])).toHaveLength(0);
    });

    it('com a permissão a prévia traz as transações e os totais, mascara titular, documento e conta, e o commit grava como lido pelo modelo', async () => {
        const owner: Account = await harness.signUp('model_read');
        const file: Buffer = await statementPdf('B');
        mock.enqueue(modelAnswer(READ_TRANSACTIONS));
        const before: number = sent.length;

        const reply: Reply = await upload(owner, file, { modelConsent: 'true' }, 'extrato-outubro.pdf');

        expect(reply.status).toBe(200);
        const model = reply.body['model'] as ModelBody;
        expect(reply.body).toMatchObject({
            format: 'model',
            fileName: 'extrato-outubro.pdf',
            rows: 3,
            periodStart: '2026-10-01',
            periodEnd: '2026-10-05',
            totals: { inflowMinor: 500000, outflowMinor: 16290 },
            accountHint: { institution: 'Banco Exemplo', numberLast4: null }
        });
        expect(model.transactions.map((transaction) => transaction.description)).toEqual([
            'SALARIO EMPRESA EXEMPLO',
            MERCHANT,
            `PIX ENVIADO ${PAYEE}`
        ]);
        expect(sent).toHaveLength(before + 1);
        const request: string = JSON.stringify(sent.at(-1)?.request.messages);
        expect(sent.at(-1)?.request.task).toBe('statement_extract');
        expect(request).toContain(MERCHANT);
        for (const secret of [HOLDER, DOCUMENT, ACCOUNT_NUMBER]) {
            expect(request).not.toContain(secret);
        }

        const again: Reply = await upload(owner, file, { modelConsent: 'true' }, 'extrato-outubro.pdf');
        expect(sent).toHaveLength(before + 1);
        expect((again.body['model'] as ModelBody).previewId).toBe(model.previewId);

        const commit = await harness.call<Record<string, unknown>>(owner.token, 'POST', '/spending/imports/model', {
            previewId: model.previewId,
            newAccountName: 'Conta do PDF',
            newAccountKind: 'checking'
        });

        expect(commit.status).toBe(201);
        expect(commit.body).toMatchObject({ format: 'model', rows: 3, inserted: 3, duplicates: 0, status: 'completed' });
        const saved = await rows<{ source: string; description: string; amountMinor: string }>(
            'SELECT "source", "description", "amountMinor" FROM "Transactions" WHERE "companyId" = $1 ORDER BY "date"',
            [owner.company.id]
        );
        expect(saved.map((row) => row.source)).toEqual(['model', 'model', 'model']);
        expect(saved.map((row) => Number(row.amountMinor))).toEqual([500000, -1290, -15000]);
        const imports = await rows<{ format: string; fileName: string }>(
            'SELECT "format", "fileName" FROM "TransactionImports" WHERE "companyId" = $1',
            [owner.company.id]
        );
        expect(imports).toEqual([{ format: 'model', fileName: 'extrato-outubro.pdf' }]);
        expect(await rows('SELECT 1 FROM "StatementImportPreviews" WHERE "companyId" = $1', [owner.company.id])).toHaveLength(0);

        const usage = await rows<{ feature: string; task: string }>(
            'SELECT "feature", "task" FROM "PaidUsageEntries" WHERE "companyId" = $1',
            [owner.company.id]
        );
        expect(usage).toEqual([{ feature: 'ai', task: 'statement_extract' }]);

        const twice = await harness.call<Record<string, unknown>>(owner.token, 'POST', '/spending/imports/model', {
            previewId: model.previewId,
            accountId: commit.body['accountId']
        });
        expect([twice.status, twice.body['type']]).toEqual([410, 'imports.preview_expired']);

        const listed = await harness.call<{ data: { format: string }[] }>(owner.token, 'GET', '/spending/imports');
        expect(listed.body.data.map((item) => item.format)).toEqual(['model']);
    });

    it('não consegui ler: o modelo não acha transação, a resposta pede outro arquivo e nada fica guardado', async () => {
        const owner: Account = await harness.signUp('model_unreadable');
        mock.enqueue(modelAnswer([]));

        const empty: Reply = await upload(owner, await statementPdf('C'), { modelConsent: 'true' });

        expect(empty.status).toBe(422);
        expect(empty.body).toMatchObject({ type: 'imports.model_unreadable', meta: { reason: 'no_transactions' } });

        mock.enqueue('isto não é JSON');
        const broken: Reply = await upload(owner, await statementPdf('D'), { modelConsent: 'true' });

        expect(broken.status).toBe(422);
        expect(broken.body).toMatchObject({ type: 'imports.model_unreadable', meta: { reason: 'invalid_response' } });
        expect(await rows('SELECT 1 FROM "StatementImportPreviews" WHERE "companyId" = $1', [owner.company.id])).toHaveLength(0);
        expect(await rows('SELECT 1 FROM "Transactions" WHERE "companyId" = $1', [owner.company.id])).toHaveLength(0);
    });

    it('a prévia de outra conta não serve, e a prévia vencida some quando o job de expiração roda', async () => {
        const owner: Account = await harness.signUp('model_owner');
        const stranger: Account = await harness.signUp('model_stranger');
        mock.enqueue(modelAnswer(READ_TRANSACTIONS));
        const reply: Reply = await upload(owner, await statementPdf('E'), { modelConsent: 'true' });
        const previewId: string = (reply.body['model'] as ModelBody).previewId;

        const foreign = await harness.call<Record<string, unknown>>(stranger.token, 'POST', '/spending/imports/model', {
            previewId,
            newAccountName: 'Intrusa',
            newAccountKind: 'other'
        });
        expect([foreign.status, foreign.body['type']]).toEqual([410, 'imports.preview_expired']);

        const previews: ImportPreviewApplication = harness.app.get(ImportPreviewApplication, { strict: false });
        await harness.inCompany(owner.company.id, async () => previews.expire(previewId));
        expect(await rows('SELECT 1 FROM "StatementImportPreviews" WHERE "id" = $1', [previewId])).toHaveLength(1);

        await harness.pg.query(`UPDATE "StatementImportPreviews" SET "expiresAt" = now() - interval '1 minute' WHERE "id" = $1`, [
            previewId
        ]);
        await harness.inCompany(owner.company.id, async () => previews.expire(previewId));
        expect(await rows('SELECT 1 FROM "StatementImportPreviews" WHERE "id" = $1', [previewId])).toHaveLength(0);
    });

    it('os logs não levam descrição de transação nem nome da pessoa', () => {
        const text: string = logged.join('\n');

        for (const secret of [HOLDER, DOCUMENT, MERCHANT, PAYEE, 'SALARIO EMPRESA EXEMPLO']) {
            expect(text).not.toContain(secret);
        }
        expect(text).toContain('statement import model read');
    });
});
