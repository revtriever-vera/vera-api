import { AddressInfo, Server } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { LogService } from '../../src/core/observability/log.service';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';

interface Reply<T = Record<string, unknown>> {
    readonly status: number;
    readonly body: T;
}

interface LineBody {
    readonly lineId: string;
    readonly status: string;
    readonly reason: string | null;
    readonly ticker: string | null;
    readonly positionMode: string | null;
}

interface EffectBody {
    readonly ticker: string;
    readonly existingPosition: boolean;
    readonly before: { readonly quantity: string; readonly averagePrice: string | null } | null;
    readonly after: { readonly quantity: string; readonly averagePrice: string | null } | null;
}

interface PreviewBody {
    readonly previewId: string;
    readonly operations: LineBody[];
    readonly effect: EffectBody[];
    readonly alreadyImportedAt: string | null;
    readonly warnings: { readonly code: string; readonly count: number }[];
}

interface CommitBody {
    readonly importId: string;
    readonly applied: number;
    readonly skipped: number;
    readonly positions: EffectBody[];
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: Record<string, unknown>;
}

const NEGOTIATION_HEADER: string =
    'Data do Negócio;Tipo de Movimentação;Mercado;Prazo/Vencimento;Instituição;Código de Negociação;Quantidade;Preço;Valor;Titular';
const MOVEMENT_HEADER: string = 'Entrada/Saída;Data;Movimentação;Produto;Instituição;Quantidade;Preço unitário;Valor da Operação;Titular';
const HOLDER_SENTINEL: string = 'TITULAR-SENTINELA-QX9';
const FILE_NAME: string = 'relatorio-sentinela-7k.csv';

function negotiation(...rows: string[][]): Buffer {
    const lines: string[] = rows.map((row: string[]): string => `${row.join(';')};${HOLDER_SENTINEL}`);
    return Buffer.from([NEGOTIATION_HEADER, ...lines].join('\n'), 'utf8');
}

function movement(...rows: string[][]): Buffer {
    const lines: string[] = rows.map((row: string[]): string => `${row.join(';')};${HOLDER_SENTINEL}`);
    return Buffer.from([MOVEMENT_HEADER, ...lines].join('\n'), 'utf8');
}

function trade(date: string, side: string, ticker: string, quantity: string, price: string): string[] {
    return [date, side, 'Mercado à Vista', '-', 'CORRETORA EXEMPLO', ticker, quantity, price, '-'];
}

describe('investment import', () => {
    let harness: AllocationHarness;
    let origin: string;
    const assetIds: Record<string, string> = {};
    const logged: string[] = [];

    beforeAll(async () => {
        harness = await AllocationHarness.start('investment_import');
        const address: AddressInfo = (harness.app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
        for (const symbol of ['PETR4', 'VALE3', 'ITUB4', 'WEGE3', 'MGLU3', 'BBAS3']) {
            const id: string = crypto.randomUUID();
            await harness.pg.query(
                `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals")
                 VALUES ($1,'B3',$2,$2,$2,'stock','acoes_br','acoes_br','BRL','brapi',0)`,
                [id, symbol]
            );
            assetIds[symbol] = id;
        }
        const logs: LogService = harness.app.get(LogService, { strict: false });
        for (const level of ['info', 'warn', 'error', 'debug'] as const) {
            const original = logs[level].bind(logs);
            vi.spyOn(logs, level).mockImplementation((entry) => {
                logged.push(JSON.stringify(entry));
                original(entry);
            });
        }
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function upload(
        token: string | null,
        file: Buffer,
        fields: Record<string, string> = {},
        name: string = FILE_NAME
    ): Promise<Reply> {
        const form: FormData = new FormData();
        for (const [key, value] of Object.entries(fields)) {
            form.append(key, value);
        }
        form.append('file', new Blob([new Uint8Array(file)]), name);
        const response: Response = await fetch(`${origin}/investment-imports/preview`, {
            method: 'POST',
            body: form,
            headers: token === null ? {} : { authorization: `Bearer ${token}` }
        });
        return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    }

    async function preview(account: Account, file: Buffer): Promise<PreviewBody> {
        const reply: Reply = await upload(account.token, file);
        expect(reply.status).toBe(200);
        return reply.body as unknown as PreviewBody;
    }

    async function commit<T = Record<string, unknown>>(account: Account, previewId: string, edits: unknown[] = []): Promise<Reply<T>> {
        return harness.call<T>(account.token, 'POST', '/investment-imports', { previewId, edits });
    }

    async function positionOf(account: Account, symbol: string): Promise<{ quantity: number; averagePrice: number | null } | null> {
        const result = await harness.pg.query<{ quantity: string; averagePrice: string | null }>(
            `SELECT "quantity", "averagePrice" FROM "Positions" WHERE "companyId" = $1 AND "assetId" = $2 AND "deletedAt" IS NULL`,
            [account.company.id, assetIds[symbol]]
        );
        const row = result.rows[0];
        return row === undefined
            ? null
            : { quantity: Number(row.quantity), averagePrice: row.averagePrice === null ? null : Number(row.averagePrice) };
    }

    function effectOf(body: { effect: EffectBody[] }, ticker: string): EffectBody | undefined {
        return body.effect.find((item: EffectBody): boolean => item.ticker === ticker);
    }

    it('exige sessão e papel de editor', async () => {
        const owner: Account = await harness.signUp('papel');
        const viewer: Account = await asRole(harness, owner, 'viewer');
        const file: Buffer = negotiation(trade('10/02/2025', 'Compra', 'PETR4', '100', '10'));
        expect((await upload(null, file)).status).toBe(401);
        expect((await upload(viewer.token, file)).status).toBe(403);
        const ready: PreviewBody = await preview(owner, file);
        expect((await commit(viewer, ready.previewId)).status).toBe(403);
        expect((await harness.call(viewer.token, 'DELETE', `/investment-imports/${crypto.randomUUID()}`)).status).toBe(403);
        expect((await harness.call(viewer.token, 'GET', '/investment-imports')).status).toBe(200);
    });

    it('a prévia não grava posição, o commit grava a partir do previewId e a conta Free importa', async () => {
        const owner: Account = await harness.signUp('basico');
        const file: Buffer = negotiation(
            trade('10/02/2025', 'Compra', 'PETR4', '100', '10'),
            trade('11/02/2025', 'Compra', 'PETR4', '100', '20'),
            trade('12/02/2025', 'Venda', 'PETR4', '50', '30')
        );

        const ready: PreviewBody = await preview(owner, file);

        expect(ready.operations.map((line: LineBody): string => line.status)).toEqual(['ok', 'ok', 'ok']);
        expect(effectOf(ready, 'PETR4')?.after).toEqual({ quantity: '150', averagePrice: '15' });
        expect(await positionOf(owner, 'PETR4')).toBeNull();

        const done: Reply<CommitBody> = await commit<CommitBody>(owner, ready.previewId);

        expect(done.status).toBe(201);
        expect(done.body.applied).toBe(3);
        expect(done.body.positions[0]?.after?.quantity).toBe('150');
        expect(await positionOf(owner, 'PETR4')).toMatchObject({ quantity: 150, averagePrice: 15 });
        const left = await harness.pg.query(`SELECT 1 FROM "InvestmentImportPreviews" WHERE "companyId" = $1`, [owner.company.id]);
        expect(left.rowCount).toBe(0);
        expect((await commit<ProblemBody>(owner, ready.previewId)).body.type).toBe('preview.expired');
    });

    it('o mesmo arquivo de novo vira "já importado" e as linhas viram duplicadas', async () => {
        const owner: Account = await harness.signUp('duplicado');
        const file: Buffer = negotiation(trade('10/03/2025', 'Compra', 'VALE3', '10', '50'));
        await commit(owner, (await preview(owner, file)).previewId);

        const again: PreviewBody = await preview(owner, file);

        expect(again.alreadyImportedAt).not.toBeNull();
        expect(again.operations[0]?.status).toBe('duplicate');
        const result = await commit<CommitBody>(owner, again.previewId);
        expect(result.body.applied).toBe(0);
        expect(await positionOf(owner, 'VALE3')).toMatchObject({ quantity: 10 });
    });

    it('a correção de quantidade na confirmação muda o efeito', async () => {
        const owner: Account = await harness.signUp('correcao');
        const ready: PreviewBody = await preview(owner, negotiation(trade('10/03/2025', 'Compra', 'ITUB4', '100', '30')));
        expect(effectOf(ready, 'ITUB4')?.after?.quantity).toBe('100');

        const done = await commit<CommitBody>(owner, ready.previewId, [
            { lineId: ready.operations[0]?.lineId, quantity: '40', feesMinor: 400 }
        ]);

        expect(done.status).toBe(201);
        expect(done.body.positions[0]?.after).toEqual({ quantity: '40', averagePrice: '30.1' });
        expect(await positionOf(owner, 'ITUB4')).toMatchObject({ quantity: 40, averagePrice: 30.1 });
    });

    it('linha bloqueada impede o commit até ser corrigida ou pulada, e a prévia continua válida', async () => {
        const owner: Account = await harness.signUp('bloqueada');
        const ready: PreviewBody = await preview(
            owner,
            negotiation(
                trade('10/03/2025', 'Compra', 'WEGE3', '10', '40'),
                trade('11/03/2025', 'Compra', 'XXXX3', '5', '10'),
                trade('12/03/2025', 'Venda', 'WEGE3', '30', '41')
            )
        );
        const statuses: string[] = ready.operations.map((line: LineBody): string => `${line.status}:${line.reason ?? ''}`);
        expect(statuses).toEqual(['ok:', 'blocked:asset_not_found', 'blocked:sell_exceeds_position']);

        const refused = await commit<ProblemBody>(owner, ready.previewId);
        expect(refused.status).toBe(422);
        expect(refused.body.type).toBe('import.has_blocked_lines');
        expect(refused.body.meta?.['lineIds']).toEqual(['L2', 'L3']);

        const edits: unknown[] = [
            { lineId: 'L2', assetId: assetIds['MGLU3'] },
            { lineId: 'L3', quantity: '4' }
        ];
        const done = await commit<CommitBody>(owner, ready.previewId, edits);
        expect(done.status).toBe(201);
        expect(await positionOf(owner, 'WEGE3')).toMatchObject({ quantity: 6 });
        expect(await positionOf(owner, 'MGLU3')).toMatchObject({ quantity: 5 });
    });

    it('rejeita edição de linha que não existe e linha repetida', async () => {
        const owner: Account = await harness.signUp('edicao');
        const ready: PreviewBody = await preview(owner, negotiation(trade('10/03/2025', 'Compra', 'BBAS3', '10', '40')));
        const unknown = await commit<ProblemBody>(owner, ready.previewId, [{ lineId: 'L99', skip: true }]);
        const repeated = await commit<ProblemBody>(owner, ready.previewId, [
            { lineId: 'L1', skip: true },
            { lineId: 'L1', skip: true }
        ]);
        expect([unknown.body.type, repeated.body.type]).toEqual(['import.invalid_edit', 'import.invalid_edit']);
        const skipped = await commit<CommitBody>(owner, ready.previewId, [{ lineId: 'L1', skip: true }]);
        expect(skipped.body.applied).toBe(0);
        expect(await positionOf(owner, 'BBAS3')).toBeNull();
    });

    it('prévia vencida devolve preview.expired e a limpeza apaga as vencidas', async () => {
        const owner: Account = await harness.signUp('vencida');
        const ready: PreviewBody = await preview(owner, negotiation(trade('10/03/2025', 'Compra', 'PETR4', '10', '40')));
        await harness.pg.query(`UPDATE "InvestmentImportPreviews" SET "expiresAt" = now() - interval '1 minute' WHERE "id" = $1`, [
            ready.previewId
        ]);

        const late = await commit<ProblemBody>(owner, ready.previewId);

        expect(late.status).toBe(410);
        expect(late.body.type).toBe('preview.expired');
        const { InvestmentImportPreviewApplication } =
            await import('../../src/modules/investment-import/application/investment-import-preview.application');
        const removed: number = await harness.inCompany(owner.company.id, async () =>
            harness.app.get(InvestmentImportPreviewApplication, { strict: false }).purgeExpired()
        );
        expect(removed).toBeGreaterThanOrEqual(1);
        const left = await harness.pg.query(`SELECT 1 FROM "InvestmentImportPreviews" WHERE "id" = $1`, [ready.previewId]);
        expect(left.rowCount).toBe(0);
    });

    it('ativo com posição pede a escolha: add soma, history_only só registra', async () => {
        const owner: Account = await harness.signUp('modo');
        await harness.call(owner.token, 'POST', '/positions', { assetId: assetIds['VALE3'], quantity: '100', averagePrice: '10' });
        const ready: PreviewBody = await preview(owner, negotiation(trade('10/03/2025', 'Compra', 'VALE3', '100', '20')));
        expect(ready.operations[0]).toMatchObject({ status: 'check', reason: 'position_mode_required', positionMode: null });
        expect(effectOf(ready, 'VALE3')).toMatchObject({ existingPosition: true });

        const refused = await commit<ProblemBody>(owner, ready.previewId);
        expect(refused.body.type).toBe('import.position_mode_required');

        const historyOnly = await commit<CommitBody>(owner, ready.previewId, [{ lineId: 'L1', positionMode: 'history_only' }]);
        expect(historyOnly.status).toBe(201);
        expect(await positionOf(owner, 'VALE3')).toMatchObject({ quantity: 100, averagePrice: 10 });
        const stored = await harness.pg.query<{ appliedToPosition: boolean }>(
            `SELECT "appliedToPosition" FROM "InvestmentOperations" WHERE "importId" = $1`,
            [historyOnly.body.importId]
        );
        expect(stored.rows[0]?.appliedToPosition).toBe(false);

        const second: PreviewBody = await preview(owner, negotiation(trade('11/03/2025', 'Compra', 'VALE3', '100', '20')));
        const added = await commit<CommitBody>(owner, second.previewId, [{ lineId: 'L1', positionMode: 'add' }]);
        expect(added.status).toBe(201);
        expect(await positionOf(owner, 'VALE3')).toMatchObject({ quantity: 200, averagePrice: 15 });
    });

    it('desdobro e bonificação viram fator usando a posição; liquidação fica ignorada', async () => {
        const owner: Account = await harness.signUp('eventos');
        await commit(owner, (await preview(owner, negotiation(trade('10/03/2025', 'Compra', 'ITUB4', '300', '30')))).previewId);
        const ready: PreviewBody = await preview(
            owner,
            movement(
                ['Credito', '02/12/2025', 'Desdobro', 'ITUB4 - ITAU', 'CORRETORA EXEMPLO', '300', '-', '-'],
                ['Credito', '03/12/2025', 'Bonificação em Ativos', 'ITUB4 - ITAU', 'CORRETORA EXEMPLO', '60', '5', '300'],
                ['Credito', '04/12/2025', 'Transferência - Liquidação', 'ITUB4 - ITAU', 'CORRETORA EXEMPLO', '10', '5', '50']
            )
        );
        expect(ready.operations.map((line: LineBody): string => line.status)).toEqual(['check', 'check', 'ignored']);

        const done = await commit<CommitBody>(owner, ready.previewId, [
            { lineId: 'L1', positionMode: 'add' },
            { lineId: 'L2', positionMode: 'add' }
        ]);

        expect(done.status).toBe(201);
        expect(await positionOf(owner, 'ITUB4')).toMatchObject({ quantity: 660 });
        const again: PreviewBody = await preview(
            owner,
            movement(['Credito', '02/12/2025', 'Desdobro', 'ITUB4 - ITAU', 'CORRETORA EXEMPLO', '300', '-', '-'])
        );
        expect(again.operations[0]?.status).toBe('duplicate');
    });

    it('desdobro creditado soma a quantidade creditada à posição, sem tratá-la como fator', async () => {
        const owner: Account = await harness.signUp('creditado');
        await commit(owner, (await preview(owner, negotiation(trade('10/03/2025', 'Compra', 'ITUB4', '300', '30')))).previewId);
        const ready: PreviewBody = await preview(
            owner,
            movement(['Credito', '02/12/2025', 'Desdobro', 'ITUB4 - ITAU', 'CORRETORA EXEMPLO', '100', '-', '-'])
        );

        expect(ready.operations[0]?.status).toBe('check');
        expect(effectOf(ready, 'ITUB4')?.after).toEqual({ quantity: '400', averagePrice: '22.5' });

        const done = await commit<CommitBody>(owner, ready.previewId, [{ lineId: 'L1', positionMode: 'add' }]);

        expect(done.status).toBe(201);
        expect(done.body.positions[0]?.after).toEqual({ quantity: '400', averagePrice: '22.5' });
        expect(await positionOf(owner, 'ITUB4')).toMatchObject({ quantity: 400, averagePrice: 22.5 });
    });

    it('desfaz a importação, bloqueia desfazer quando há importação posterior e não repete', async () => {
        const owner: Account = await harness.signUp('desfazer');
        const first = await commit<CommitBody>(
            owner,
            (await preview(owner, negotiation(trade('10/03/2025', 'Compra', 'PETR4', '100', '10')))).previewId
        );
        const next: PreviewBody = await preview(owner, negotiation(trade('11/03/2025', 'Compra', 'PETR4', '50', '12')));
        const second = await commit<CommitBody>(owner, next.previewId, [{ lineId: 'L1', positionMode: 'add' }]);

        const blocked = await harness.call<ProblemBody>(owner.token, 'DELETE', `/investment-imports/${first.body.importId}`);
        expect(blocked.status).toBe(409);
        expect(blocked.body.type).toBe('import.undo_blocked');
        expect(blocked.body.meta?.['reason']).toBe('later_import');

        expect((await harness.call(owner.token, 'DELETE', `/investment-imports/${second.body.importId}`)).status).toBe(200);
        expect(await positionOf(owner, 'PETR4')).toMatchObject({ quantity: 100 });
        expect((await harness.call(owner.token, 'DELETE', `/investment-imports/${first.body.importId}`)).status).toBe(200);
        expect(await positionOf(owner, 'PETR4')).toBeNull();
        expect((await harness.call<ProblemBody>(owner.token, 'DELETE', `/investment-imports/${first.body.importId}`)).status).toBe(409);

        const listed = await harness.call<{ data: { id: string; status: string; operations: number }[] }>(
            owner.token,
            'GET',
            '/investment-imports'
        );
        expect(listed.body.data.map((item): string => item.status)).toEqual(['undone', 'undone']);
    });

    it('recusa arquivo desconhecido, PDF sem confirmação, PDF quebrado e arquivo vazio', async () => {
        const owner: Account = await harness.signUp('formato');
        const unknown: Reply = await upload(owner.token, Buffer.from('a;b\n1;2\n'));
        expect([unknown.status, unknown.body['type']]).toEqual([422, 'format.not_recognized']);
        const pdf: Reply = await upload(owner.token, Buffer.from('%PDF-1.4 conteudo'));
        expect([pdf.status, pdf.body['type']]).toEqual([428, 'model.confirmation_required']);
        const consented: Reply = await upload(owner.token, Buffer.from('%PDF-1.4 conteudo'), { modelConsent: 'true' });
        expect([consented.status, consented.body['type']]).toEqual([422, 'file.unreadable']);
        const noFile: Response = await fetch(`${origin}/investment-imports/preview`, {
            method: 'POST',
            body: new FormData(),
            headers: { authorization: `Bearer ${owner.token}` }
        });
        expect(noFile.status).toBe(400);
    });

    it('duas companies ficam isoladas', async () => {
        const first: Account = await harness.signUp('iso-a');
        const second: Account = await harness.signUp('iso-b');
        const ready: PreviewBody = await preview(first, negotiation(trade('10/03/2025', 'Compra', 'WEGE3', '10', '40')));

        const stolen = await commit<ProblemBody>(second, ready.previewId);
        expect(stolen.body.type).toBe('preview.expired');
        const done = await commit<CommitBody>(first, ready.previewId);
        expect((await harness.call(second.token, 'DELETE', `/investment-imports/${done.body.importId}`)).status).toBe(404);
        const listed = await harness.call<{ data: unknown[] }>(second.token, 'GET', '/investment-imports');
        expect(listed.body.data).toEqual([]);
        expect(await positionOf(second, 'WEGE3')).toBeNull();
    });

    it('nem o texto do arquivo, nem o titular, nem ativo ou nome de arquivo aparecem em log, banco ou resposta', async () => {
        const owner: Account = await harness.signUp('privacidade');
        const file: Buffer = negotiation(trade('10/03/2025', 'Compra', 'BBAS3', '77', '33,33'));
        logged.length = 0;

        const reply: Reply = await upload(owner.token, file);
        const ready: PreviewBody = reply.body as unknown as PreviewBody;
        const done: Reply = await commit(owner, ready.previewId);
        await harness.call(owner.token, 'GET', '/investment-imports');

        const inLogs: string = logged.join('\n');
        for (const secret of [HOLDER_SENTINEL, FILE_NAME, 'BBAS3', '33,33', 'CORRETORA EXEMPLO']) {
            expect(inLogs).not.toContain(secret);
        }
        expect(JSON.stringify(reply.body)).not.toContain(HOLDER_SENTINEL);
        expect(JSON.stringify(done.body)).not.toContain(HOLDER_SENTINEL);
        for (const table of ['InvestmentImports', 'InvestmentOperations']) {
            const dump = await harness.pg.query(`SELECT t::text AS row FROM "${table}" t WHERE "companyId" = $1`, [owner.company.id]);
            expect(JSON.stringify(dump.rows)).not.toContain(HOLDER_SENTINEL);
        }
        const stored = await harness.pg.query<{ payload: unknown }>(`SELECT payload FROM "InvestmentImportPreviews"`);
        expect(JSON.stringify(stored.rows)).not.toContain(HOLDER_SENTINEL);
        expect(JSON.stringify(stored.rows)).not.toContain('CORRETORA');
    });
    describe('leitura por modelo', () => {
        const MODEL_SENTINEL: string = 'PRODUTO-SENTINELA-MODELO-ZZ';
        let mock: MockLlmDriver;

        beforeAll(() => {
            mock = harness.app.get(MockLlmDriver, { strict: false });
        });

        async function printOf(width: number): Promise<Buffer> {
            return sharp({ create: { width, height: 300, channels: 3, background: '#ffffff' } })
                .png()
                .toBuffer();
        }

        function modelAnswer(rows: Record<string, unknown>[]): string {
            return JSON.stringify({ documentType: 'screenshot', currency: 'BRL', totalMinor: null, operations: rows });
        }

        function modelRow(ticker: string, quantity: string, unitPrice: string, grossMinor: number): Record<string, unknown> {
            return {
                kind: 'buy',
                direction: 'credit',
                tradeDate: '2026-11-03',
                ticker,
                productName: MODEL_SENTINEL,
                quantity,
                unitPrice,
                grossMinor,
                currency: 'BRL'
            };
        }

        it('sem modelConsent nada vai ao modelo; com ele a conta Free lê o print e a confirmação não chama o modelo de novo', async () => {
            const owner: Account = await harness.signUp('modelo');
            const file: Buffer = await printOf(401);
            const generate = vi.spyOn(mock, 'generate');
            mock.enqueue(modelAnswer([modelRow('PETR4', '100', '10', 100000), modelRow('VALE3', '10', '50', 60000)]));
            logged.length = 0;

            const refused: Reply<ProblemBody> = (await upload(owner.token, file, {}, 'print.png')) as unknown as Reply<ProblemBody>;

            expect(refused.status).toBe(428);
            expect(refused.body.type).toBe('model.confirmation_required');
            expect(generate).not.toHaveBeenCalled();

            const reply: Reply = await upload(owner.token, file, { modelConsent: 'true' }, 'print.png');
            const ready: PreviewBody & { source: string; documentType: string } = reply.body as never;

            expect(reply.status).toBe(200);
            expect(ready.source).toBe('model');
            expect(ready.documentType).toBe('screenshot');
            expect(
                ready.operations.map((line: LineBody): string => `${String(line.ticker)}:${line.status}:${String(line.reason)}`)
            ).toEqual(['PETR4:ok:null', 'VALE3:check:amount_mismatch']);
            expect(generate).toHaveBeenCalledTimes(1);

            const done: Reply<CommitBody> = await commit<CommitBody>(owner, ready.previewId);

            expect(done.status).toBe(201);
            expect(done.body.applied).toBe(2);
            expect(generate).toHaveBeenCalledTimes(1);
            expect(await positionOf(owner, 'PETR4')).toMatchObject({ quantity: 100 });
            generate.mockRestore();
        });

        it('a leitura entra na cota de IA da conta e, com a cota estourada, responde usage.cap_reached sem chamar o modelo', async () => {
            const owner: Account = await harness.signUp('modelo-cota');
            mock.enqueue(modelAnswer([modelRow('PETR4', '100', '10', 100000)]));

            const read: Reply = await upload(owner.token, await printOf(405), { modelConsent: 'true' }, 'print.png');

            expect(read.status).toBe(200);
            const usage = await harness.pg.query<{ feature: string; task: string }>(
                'SELECT "feature", "task" FROM "PaidUsageEntries" WHERE "companyId" = $1',
                [owner.company.id]
            );
            expect(usage.rows).toEqual([{ feature: 'ai', task: 'investment_extract' }]);

            const capped: Account = await harness.signUp('modelo-cota-estourada');
            await harness.pg.query(
                `INSERT INTO "PaidUsageEntries" ("id","companyId","period","feature","task","referenceId","costMicros","outcome")
                 VALUES ($1,$2,to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'),'ai','summary_month','seed',100000000,'answered')`,
                [crypto.randomUUID(), capped.company.id]
            );
            const generate = vi.spyOn(mock, 'generate');

            const blocked: Reply<ProblemBody> = (await upload(
                capped.token,
                await printOf(406),
                { modelConsent: 'true' },
                'print.png'
            )) as never;

            expect([blocked.status, blocked.body.type]).toEqual([429, 'usage.cap_reached']);
            expect(generate).not.toHaveBeenCalled();
            generate.mockRestore();
        });

        function snapshotAnswer(positions: Record<string, unknown>[]): string {
            return JSON.stringify({ documentType: 'screenshot', currency: 'BRL', operations: null, notes: null, positions });
        }

        it('print de carteira vira compra com custo assumido e, com a posição já na Vera, a linha é ignorada', async () => {
            const owner: Account = await harness.signUp('modelo-carteira');
            const rows: Record<string, unknown>[] = [{ block: 'equities', symbol: 'PETR4', quantity: '227', price: '38.52' }];
            mock.enqueue(snapshotAnswer(rows));

            const first: Reply = await upload(owner.token, await printOf(403), { modelConsent: 'true' }, 'print.png');
            const ready: PreviewBody = first.body as never;

            expect(first.status).toBe(200);
            expect(
                ready.operations.map((line: LineBody): string => `${String(line.ticker)}:${line.status}:${String(line.reason)}`)
            ).toEqual(['PETR4:check:assumed_cost']);
            expect((await commit<CommitBody>(owner, ready.previewId)).body.applied).toBe(1);
            expect(await positionOf(owner, 'PETR4')).toMatchObject({ quantity: 227 });

            mock.enqueue(snapshotAnswer([{ block: 'equities', symbol: 'PETR4', quantity: '250', price: '40.10' }]));
            const again: Reply = await upload(owner.token, await printOf(404), { modelConsent: 'true' }, 'print.png');

            expect(
                (again.body as unknown as PreviewBody).operations.map((line: LineBody): string => `${line.status}:${String(line.reason)}`)
            ).toEqual(['ignored:skipped']);
        });

        it('print de carteira sem preço legível devolve model.unreadable com o motivo positions_without_price', async () => {
            const owner: Account = await harness.signUp('modelo-carteira-sem-preco');
            mock.enqueue(snapshotAnswer([{ block: 'equities', symbol: 'PETR4', quantity: '227', price: null }]));

            const reply: Reply<ProblemBody> = (await upload(
                owner.token,
                await printOf(405),
                { modelConsent: 'true' },
                'print.png'
            )) as unknown as Reply<ProblemBody>;

            expect(reply.status).toBe(422);
            expect(reply.body).toMatchObject({ type: 'model.unreadable', meta: { reason: 'positions_without_price' } });
        });

        it('resposta fora do esquema devolve model.unreadable e nada fica gravado', async () => {
            const owner: Account = await harness.signUp('modelo-ilegivel');
            mock.enqueue('isto não é JSON');

            const reply: Reply<ProblemBody> = (await upload(
                owner.token,
                await printOf(402),
                { modelConsent: 'true' },
                'print.png'
            )) as unknown as Reply<ProblemBody>;

            expect(reply.status).toBe(422);
            expect(reply.body.type).toBe('model.unreadable');
            const stored = await harness.pg.query(`SELECT 1 FROM "InvestmentImportPreviews" WHERE "companyId" = $1`, [owner.company.id]);
            expect(stored.rowCount).toBe(0);
        });

        it('nenhum byte do arquivo, nome ou resposta do modelo vai para log ou banco', async () => {
            const owner: Account = await harness.signUp('modelo-privacidade');
            mock.enqueue(modelAnswer([modelRow('ITUB4', '5', '20', 10000)]));
            logged.length = 0;

            const reply: Reply = await upload(owner.token, await printOf(403), { modelConsent: 'true' }, 'meu-print-secreto.png');

            expect(reply.status).toBe(200);
            const inLogs: string = logged.join('\n');
            for (const secret of [MODEL_SENTINEL, 'meu-print-secreto', 'ITUB4']) {
                expect(inLogs).not.toContain(secret);
            }
            const stored = await harness.pg.query<{ payload: unknown }>(
                `SELECT payload FROM "InvestmentImportPreviews" WHERE "companyId" = $1`,
                [owner.company.id]
            );
            expect(JSON.stringify(stored.rows)).not.toContain(MODEL_SENTINEL);
        });
    });
});
