import { AddressInfo, Server } from 'node:net';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LlmDriverCall } from '../../src/core/llm/drivers/llm-driver';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { LlmToolDefinition } from '../../src/core/llm/llm.types';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { AssistantTurnRequestedHandler } from '../../src/modules/assistant-chat/access/queue/assistant-turn.handler';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const HOSTED_ENV: Record<string, string> = {
    DEPLOYMENT_MODE: 'hosted',
    WHATSAPP_ACCESS_TOKEN: 'hosted-token-1a2b3c4d5e6f',
    WHATSAPP_PHONE_NUMBER_ID: '104857600000099',
    WHATSAPP_VERIFY_TOKEN: 'hosted-verify-1a2b3c4d',
    WHATSAPP_APP_SECRET: 'hosted-app-secret-1a2b3c4d',
    WHATSAPP_WABA_ID: '200000000000099',
    WHATSAPP_DISPLAY_NUMBER: '+55 11 4000-0000',
    LLM_REPEAT_LIMIT: '1000'
};

const NEGOTIATION_HEADER: string =
    'Data do Negócio;Tipo de Movimentação;Mercado;Prazo/Vencimento;Instituição;Código de Negociação;Quantidade;Preço;Valor;Titular';
const HOLDER_SENTINEL: string = 'TITULAR-SENTINELA-QX9';
const FILE_NAME: string = 'relatorio-sentinela-7k.csv';
const SUMMARY: string = 'Importar 2 operações em 2 ativos.';
const IMPORT_USE = { toolUseId: 'use-import', name: 'investment_import', input: {} };

interface StartedBody {
    readonly turnId: string;
    readonly conversationId: string;
}

interface Reply<T> {
    readonly status: number;
    readonly body: T;
}

interface ActionSummary {
    readonly id: string;
    readonly tool: string;
    readonly summary: string;
    readonly status: string;
    readonly resultText: string | null;
    readonly reference: string | null;
}

interface TurnBody {
    readonly status: string;
    readonly answer?: { readonly text: string; readonly action: ActionSummary | null };
}

interface PreviewBody {
    readonly previewId: string;
    readonly operations: { readonly lineId: string; readonly ticker: string | null; readonly status: string }[];
    readonly effect: { readonly ticker: string }[];
}

interface ActionBody extends ActionSummary {
    readonly importPreview: PreviewBody | null;
}

interface ProblemBody {
    readonly type: string;
}

function negotiation(): Buffer {
    const rows: string[][] = [
        ['10/02/2025', 'Compra', 'Mercado à Vista', '-', 'CORRETORA EXEMPLO', 'PETR4', '100', '10', '-'],
        ['11/02/2025', 'Compra', 'Mercado à Vista', '-', 'CORRETORA EXEMPLO', 'VALE3', '10', '50', '-']
    ];
    const lines: string[] = rows.map((row: string[]): string => `${row.join(';')};${HOLDER_SENTINEL}`);
    return Buffer.from([NEGOTIATION_HEADER, ...lines].join('\n'), 'utf8');
}

describe('assistant chat: arquivo no turno e cartão da importação', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let harness: AllocationHarness;
    let origin: string;
    let llm: MockLlmDriver;
    let cursor: number = 0;
    let requests: LlmDriverCall[] = [];
    const assetIds: Record<string, string> = {};

    beforeAll(async () => {
        Object.assign(process.env, HOSTED_ENV);
        harness = await AllocationHarness.start('assistant_import', publisher);
        origin = `http://127.0.0.1:${String(((harness.app.getHttpServer() as Server).address() as AddressInfo).port)}`;
        for (const symbol of ['PETR4', 'VALE3']) {
            const id: string = crypto.randomUUID();
            await harness.pg.query(
                `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals")
                 VALUES ($1,'B3',$2,$2,$2,'stock','acoes_br','acoes_br','BRL','brapi',0)`,
                [id, symbol]
            );
            assetIds[symbol] = id;
        }
        llm = harness.app.get(MockLlmDriver, { strict: false });
        const original: MockLlmDriver['generate'] = llm.generate.bind(llm);
        vi.spyOn(llm, 'generate').mockImplementation((call: LlmDriverCall) => {
            requests.push(call);
            return original(call);
        });
    });

    afterEach(() => {
        requests = [];
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        for (const key of Object.keys(HOSTED_ENV)) {
            Reflect.deleteProperty(process.env, key);
        }
        await harness.stop();
    });

    async function premium(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });
        await harness.inCompany(account.company.id, async () => {
            await contracts.open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        await harness.call(account.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' });
        return account;
    }

    async function send<T>(token: string, file: Buffer, fields: Record<string, string>, name: string): Promise<Reply<T>> {
        const form: FormData = new FormData();
        for (const [key, value] of Object.entries(fields)) {
            form.append(key, value);
        }
        form.append('file', new Blob([new Uint8Array(file)]), name);
        const response: Response = await fetch(`${origin}/assistant/turns`, {
            method: 'POST',
            body: form,
            headers: { authorization: `Bearer ${token}` }
        });
        return { status: response.status, body: (await response.json()) as T };
    }

    async function drain(owner: Account): Promise<void> {
        while (cursor < publisher.published.length) {
            const message: PublishedMessage = publisher.published[cursor] as PublishedMessage;
            cursor += 1;
            if (message.type !== 'assistant-chat.turn.requested') {
                continue;
            }
            const envelope: QueueEnvelope = {
                type: message.type,
                requestId: 'int-test',
                companyId: owner.company.id,
                occurredAt: new Date().toISOString(),
                trace: {},
                payload: message.payload
            };
            await harness.inCompany(owner.company.id, async () =>
                harness.app.get(AssistantTurnRequestedHandler, { strict: false }).handle(envelope)
            );
        }
    }

    async function importTurn(owner: Account, fields: Record<string, string> = { text: 'importa isso' }): Promise<ActionSummary> {
        llm.enqueue({ text: '', toolUses: [IMPORT_USE] });
        llm.enqueue('Pronto, importei tudo!');
        const started: Reply<StartedBody> = await send<StartedBody>(owner.token, negotiation(), fields, FILE_NAME);
        expect(started.status).toBe(202);
        await drain(owner);
        const answered: Reply<TurnBody> = await harness.call<TurnBody>(owner.token, 'GET', `/assistant/turns/${started.body.turnId}`);
        expect(answered.body.status).toBe('done');
        return answered.body.answer?.action as ActionSummary;
    }

    async function positionOf(owner: Account, symbol: string): Promise<number | null> {
        const result = await harness.pg.query<{ quantity: string }>(
            `SELECT "quantity" FROM "Positions" WHERE "companyId" = $1 AND "assetId" = $2 AND "deletedAt" IS NULL`,
            [owner.company.id, assetIds[symbol]]
        );
        const row = result.rows[0];
        return row === undefined ? null : Number(row.quantity);
    }

    it('o arquivo vira o cartão com a prévia; o modelo só vê a pergunta e a ferramenta; confirmar grava as posições', async () => {
        const owner: Account = await premium('import-confirm');

        const action: ActionSummary = await importTurn(owner);

        expect(action).toMatchObject({ tool: 'investment_import', status: 'open', summary: SUMMARY, reference: null });
        const sent: LlmDriverCall = requests[0] as LlmDriverCall;
        const serialized: string = JSON.stringify(sent.request);
        expect((sent.request.tools ?? []).map((tool: LlmToolDefinition): string => tool.name)).toEqual(['investment_import']);
        for (const secret of ['PETR4', 'VALE3', HOLDER_SENTINEL, 'sentinela-7k', FILE_NAME]) {
            expect(serialized).not.toContain(secret);
        }
        expect(await positionOf(owner, 'PETR4')).toBeNull();
        const card: Reply<ActionBody> = await harness.call<ActionBody>(owner.token, 'GET', `/assistant/actions/${action.id}`);
        expect(card.body.importPreview?.operations.map((line) => `${String(line.ticker)}:${line.status}`)).toEqual([
            'PETR4:ok',
            'VALE3:ok'
        ]);
        expect(card.body.importPreview?.effect.map((item) => item.ticker)).toEqual(['PETR4', 'VALE3']);

        const confirmed: Reply<ActionSummary> = await harness.call<ActionSummary>(
            owner.token,
            'POST',
            `/assistant/actions/${action.id}/confirm`,
            {}
        );

        expect(confirmed.status).toBe(200);
        expect(confirmed.body).toMatchObject({ status: 'confirmed', resultText: 'Importação confirmada: 2 operações.' });
        expect(confirmed.body.reference).toMatch(/^[0-9a-f-]{36}$/);
        expect(await positionOf(owner, 'PETR4')).toBe(100);
        expect(await positionOf(owner, 'VALE3')).toBe(10);
        const imports = await harness.call<{ data: { id: string }[] }>(owner.token, 'GET', '/investment-imports');
        expect(imports.body.data.map((item) => item.id)).toContain(confirmed.body.reference);
        const current = await harness.call<{ messages: { role: string; text: string }[] }>(
            owner.token,
            'GET',
            '/assistant/conversations/current'
        );
        expect(current.body.messages.map((message) => message.text)).toContain(`importa isso\nArquivo: ${FILE_NAME}`);
        expect(JSON.stringify(current.body)).not.toContain('PETR4');
    });

    it('as correções do cartão vão ao commit: a linha pulada não grava', async () => {
        const owner: Account = await premium('import-edits');
        const action: ActionSummary = await importTurn(owner);

        const confirmed = await harness.call<ActionSummary>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {
            edits: [{ lineId: 'L2', skip: true }]
        });

        expect(confirmed.body.resultText).toBe('Importação confirmada: 1 operação.');
        expect(await positionOf(owner, 'PETR4')).toBe(100);
        expect(await positionOf(owner, 'VALE3')).toBeNull();
        const invalid = await harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {});
        expect(invalid.body.type).toBe('assistant.action_resolved');
    });

    it('cancelar não grava e o arquivo não volta a valer', async () => {
        const owner: Account = await premium('import-cancel');
        const action: ActionSummary = await importTurn(owner, {});

        const canceled = await harness.call<ActionSummary>(owner.token, 'POST', `/assistant/actions/${action.id}/cancel`);

        expect(canceled.body.status).toBe('canceled');
        expect(await positionOf(owner, 'PETR4')).toBeNull();
        expect((await harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {})).status).toBe(409);
    });

    it('prévia vencida: o cartão perde a tabela e o sim recebe 409 pedindo o arquivo de novo', async () => {
        const owner: Account = await premium('import-expired');
        const action: ActionSummary = await importTurn(owner);
        await harness.pg.query(`UPDATE "InvestmentImportPreviews" SET "expiresAt" = now() - interval '1 minute' WHERE "companyId" = $1`, [
            owner.company.id
        ]);

        const card: Reply<ActionBody> = await harness.call<ActionBody>(owner.token, 'GET', `/assistant/actions/${action.id}`);
        const confirmed: Reply<ProblemBody> = await harness.call<ProblemBody>(
            owner.token,
            'POST',
            `/assistant/actions/${action.id}/confirm`,
            {}
        );

        expect(card.body.importPreview).toBeNull();
        expect(confirmed.status).toBe(409);
        expect(confirmed.body.type).toBe('assistant.confirmation_stale');
        expect(await positionOf(owner, 'PETR4')).toBeNull();
    });

    it('turno sem texto e sem arquivo é 400; Leitura com arquivo é 403 e nada é guardado', async () => {
        const owner: Account = await premium('import-guard');
        const viewer: Account = await asRole(harness, owner, 'viewer');

        const empty: Reply<ProblemBody> = await harness.call<ProblemBody>(owner.token, 'POST', '/assistant/turns', {});
        const forbidden: Reply<ProblemBody> = await send<ProblemBody>(viewer.token, negotiation(), { text: 'importa' }, FILE_NAME);

        expect(empty.status).toBe(400);
        expect(empty.body.type).toBe('assistant.text_required');
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.type).toBe('members.forbidden_role');
        const messages = await harness.pg.query<{ total: number }>(
            'SELECT count(*)::int AS total FROM "AssistantMessages" WHERE "companyId" = $1',
            [owner.company.id]
        );
        expect(messages.rows[0]?.total).toBe(0);
    });

    it('Free com print: sem o envio confirmado nada vai ao modelo e nada é guardado; com ele sai a prévia e o cartão', async () => {
        const owner: Account = await harness.signUp('import-free');
        const print: Buffer = await sharp({ create: { width: 401, height: 300, channels: 3, background: '#ffffff' } })
            .png()
            .toBuffer();
        const reading: string = JSON.stringify({
            documentType: 'screenshot',
            currency: 'BRL',
            totalMinor: null,
            operations: [
                {
                    kind: 'buy',
                    direction: 'credit',
                    tradeDate: '2026-11-03',
                    ticker: 'PETR4',
                    productName: 'X',
                    quantity: '100',
                    unitPrice: '10',
                    grossMinor: 100000,
                    currency: 'BRL'
                },
                {
                    kind: 'buy',
                    direction: 'credit',
                    tradeDate: '2026-11-03',
                    ticker: 'VALE3',
                    productName: 'X',
                    quantity: '10',
                    unitPrice: '50',
                    grossMinor: 50000,
                    currency: 'BRL'
                }
            ]
        });

        const refused: Reply<ProblemBody> = await send<ProblemBody>(owner.token, print, { text: 'importa' }, 'print.png');

        expect(refused.status).toBe(428);
        expect(refused.body.type).toBe('model.confirmation_required');
        expect(requests).toHaveLength(0);
        llm.enqueue(reading);
        llm.enqueue({ text: '', toolUses: [IMPORT_USE] });
        llm.enqueue('Feito.');
        const started: Reply<StartedBody> = await send<StartedBody>(
            owner.token,
            print,
            { text: 'importa', modelConsent: 'true' },
            'print.png'
        );
        expect(started.status).toBe(202);
        await drain(owner);
        const answered = await harness.call<TurnBody>(owner.token, 'GET', `/assistant/turns/${started.body.turnId}`);

        expect(answered.body.answer?.action).toMatchObject({ tool: 'investment_import', status: 'open', summary: SUMMARY });
        const assistantRequest: LlmDriverCall = requests.at(-2) as LlmDriverCall;
        expect(JSON.stringify(assistantRequest.request)).not.toContain('PETR4');
    });
});
