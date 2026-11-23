import { afterAll, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { GatewayLlmDriver } from '../../src/core/llm/drivers/gateway-llm.driver';
import { LlmDriverResult } from '../../src/core/llm/drivers/llm-driver';
import { LlmPort } from '../../src/core/llm/llm.port';
import { LlmCredentials, LlmGenerationRequest } from '../../src/core/llm/llm.types';
import { LlmCredentialsPort } from '../../src/core/llm/ports/llm-credentials.port';
import { LlmCallsRepository } from '../../src/core/llm/repositories/llm-calls.repository';
import { LlmCallsAccountEraser } from '../../src/modules/plans/services/llm-calls-account.eraser';
import { AllocationHarness } from './support/allocation-harness';

const MARKER: string = 'MARCADOR-SECRETO-DO-PROMPT';
const PRICE_TABLE: string = JSON.stringify({
    'vendor/model-a': { input: 1, output: 2, cacheRead: 0.1 },
    'vendor/model-b': { input: 1, output: 2, cacheRead: 0.1 }
});
const CAP_MICROS: number = 20_000;

function request(overrides: Partial<LlmGenerationRequest> = {}): LlmGenerationRequest {
    return {
        task: 'summary_month',
        feature: 'ai',
        system: 'Resuma.',
        messages: [{ role: 'user', content: `${MARKER} ${crypto.randomUUID()}` }],
        ...overrides
    };
}

function result(overrides: Partial<LlmDriverResult> = {}): LlmDriverResult {
    return {
        text: 'resposta',
        toolUses: [],
        stopReason: 'end',
        usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0 },
        servedModelId: null,
        providerCostUsd: null,
        attempts: 1,
        latencyMs: 12,
        ...overrides
    };
}

describe('LlmCalls e o core/llm', () => {
    let harness: AllocationHarness;
    let gateway: GatewayLlmDriver;
    let generateSpy: MockInstance<GatewayLlmDriver['generate']>;
    const seen: LlmCredentials[] = [];

    beforeAll(async () => {
        process.env['LLM_DRIVER'] = 'live';
        process.env['LLM_PRICE_TABLE'] = PRICE_TABLE;
        process.env['PAID_USAGE_CAP_MICROS'] = String(CAP_MICROS);
        harness = await AllocationHarness.start('llm_calls');
        gateway = harness.app.get(GatewayLlmDriver, { strict: false });
        const context: AppContext = harness.app.get(AppContext);
        const credentials: LlmCredentialsPort = harness.app.get(LlmCredentialsPort, { strict: false });
        vi.spyOn(credentials, 'resolve').mockImplementation(async () => {
            const companyId: string | undefined = context.get().companyId;
            return Promise.resolve({
                driver: 'gateway',
                apiKey: `key-${String(companyId)}`,
                modelId: `vendor/model-${seenModel(companyId)}`
            });
        });
    });

    afterAll(async () => {
        delete process.env['LLM_DRIVER'];
        delete process.env['LLM_PRICE_TABLE'];
        delete process.env['PAID_USAGE_CAP_MICROS'];
        await harness.stop();
    });

    const models: Map<string, string> = new Map();

    function seenModel(companyId: string | undefined): string {
        return models.get(companyId ?? '') ?? 'a';
    }

    beforeEach(() => {
        seen.length = 0;
        generateSpy = vi.spyOn(gateway, 'generate');
        generateSpy.mockImplementation(async (call) => {
            seen.push(call.credentials);
            return Promise.resolve(result());
        });
    });

    async function callsOf(companyId: string): Promise<Record<string, unknown>[]> {
        const rows = await harness.pg.query('SELECT * FROM "LlmCalls" WHERE "companyId" = $1 ORDER BY "createdAt"', [companyId]);
        return rows.rows as Record<string, unknown>[];
    }

    it('grava uma linha sem conteúdo por chamada, com tokens e custo, e lança o custo na cota pelo callId', async () => {
        const account = await harness.signUp('calls');
        models.set(account.company.id, 'a');

        const response = await harness.inCompany(account.company.id, async () =>
            harness.app.get(LlmPort, { strict: false }).generate(request({ referenceId: 'resumo-2026-10' }))
        );

        const rows = await callsOf(account.company.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: response.callId,
            task: 'summary_month',
            feature: 'ai',
            driver: 'gateway',
            modelId: 'vendor/model-a',
            inputTokens: 1000,
            outputTokens: 500,
            outcome: 'answered',
            referenceId: 'resumo-2026-10'
        });
        expect(Number(rows[0]?.['costMicros'])).toBe(response.costMicros);
        expect(response.costMicros).toBeGreaterThan(0);
        expect(JSON.stringify(rows)).not.toContain(MARKER);
        expect(String(rows[0]?.['requestHash'])).toMatch(/^[0-9a-f]{64}$/);
        const usage = await harness.pg.query('SELECT "costMicros", "referenceId" FROM "PaidUsageEntries" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(usage.rows).toEqual([{ costMicros: String(response.costMicros), referenceId: response.callId }]);
    });

    it('duas companies com credenciais diferentes: cada chamada usa a credencial da própria company e as linhas não se misturam', async () => {
        const a = await harness.signUp('company-a');
        const b = await harness.signUp('company-b');
        models.set(a.company.id, 'a');
        models.set(b.company.id, 'b');
        const llm: LlmPort = harness.app.get(LlmPort, { strict: false });

        await harness.inCompany(a.company.id, async () => llm.generate(request()));
        await harness.inCompany(b.company.id, async () => llm.generate(request()));

        expect(seen).toEqual([
            { driver: 'gateway', apiKey: `key-${a.company.id}`, modelId: 'vendor/model-a' },
            { driver: 'gateway', apiKey: `key-${b.company.id}`, modelId: 'vendor/model-b' }
        ]);
        const repository: LlmCallsRepository = harness.app.get(LlmCallsRepository, { strict: false });
        const visibleToB = await harness.inCompany(b.company.id, async () => repository.findMany({}));
        expect(visibleToB).toHaveLength(1);
        expect(visibleToB[0]?.modelId).toBe('vendor/model-b');
        expect(await callsOf(a.company.id)).toHaveLength(1);
    });

    it('apagar a company A apaga as LlmCalls de A (cascade) e deixa as de B', async () => {
        const a = await harness.signUp('erase-a');
        const b = await harness.signUp('erase-b');
        models.set(a.company.id, 'a');
        models.set(b.company.id, 'b');
        const llm: LlmPort = harness.app.get(LlmPort, { strict: false });
        await harness.inCompany(a.company.id, async () => llm.generate(request()));
        await harness.inCompany(b.company.id, async () => llm.generate(request()));

        await harness.pg.query('DELETE FROM "Companies" WHERE id = $1', [a.company.id]);

        expect(await callsOf(a.company.id)).toHaveLength(0);
        expect(await callsOf(b.company.id)).toHaveLength(1);
    });

    it('o eraser da conta apaga as chamadas da company e só dela', async () => {
        const a = await harness.signUp('eraser-a');
        const b = await harness.signUp('eraser-b');
        models.set(a.company.id, 'a');
        models.set(b.company.id, 'b');
        const llm: LlmPort = harness.app.get(LlmPort, { strict: false });
        await harness.inCompany(a.company.id, async () => llm.generate(request()));
        await harness.inCompany(a.company.id, async () => llm.generate(request()));
        await harness.inCompany(b.company.id, async () => llm.generate(request()));
        const eraser: LlmCallsAccountEraser = harness.app.get(LlmCallsAccountEraser, { strict: false });

        const erased: number = await harness.app
            .get(AppContext)
            .run({ requestId: 'system', locale: 'pt-BR' }, async () => eraser.eraseAll(a.company.id));

        expect(erased).toBe(2);
        expect(await callsOf(a.company.id)).toHaveLength(0);
        expect(await callsOf(b.company.id)).toHaveLength(1);
    });

    it('sem folga na cota o driver nem é chamado: usage.cap_reached sobe intacto e a chamada fica como cap_reached', async () => {
        const account = await harness.signUp('cap');
        models.set(account.company.id, 'a');
        const llm: LlmPort = harness.app.get(LlmPort, { strict: false });
        generateSpy.mockImplementation(async () =>
            Promise.resolve(result({ usage: { inputTokens: 0, outputTokens: 5_000_000, cacheReadTokens: 0 } }))
        );

        await harness.inCompany(account.company.id, async () => llm.generate(request()));
        await expect(harness.inCompany(account.company.id, async () => llm.generate(request()))).rejects.toMatchObject({
            code: 'usage.cap_reached',
            status: 429
        });

        const rows = await callsOf(account.company.id);
        expect(rows.map((row) => row['outcome'])).toEqual(['answered', 'cap_reached']);
        expect(generateSpy).toHaveBeenCalledTimes(1);
    });

    it('falha do provedor grava failed com custo zero e lança zero na cota como não respondida', async () => {
        const account = await harness.signUp('failed');
        models.set(account.company.id, 'a');
        const llm: LlmPort = harness.app.get(LlmPort, { strict: false });
        generateSpy.mockRejectedValue(new Error('provider down'));

        await expect(harness.inCompany(account.company.id, async () => llm.generate(request()))).rejects.toThrow('provider down');

        const rows = await callsOf(account.company.id);
        expect(rows[0]).toMatchObject({ outcome: 'failed', costMicros: '0' });
        const usage = await harness.pg.query('SELECT "costMicros", outcome FROM "PaidUsageEntries" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(usage.rows).toEqual([{ costMicros: '0', outcome: 'unanswered' }]);
    });

    it('o mesmo corpo respondido além do limite em 24 h vira ai.repeated_request', async () => {
        const account = await harness.signUp('repeat');
        models.set(account.company.id, 'a');
        const llm: LlmPort = harness.app.get(LlmPort, { strict: false });
        const same: LlmGenerationRequest = request();
        generateSpy.mockImplementation(async () =>
            Promise.resolve(result({ usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } }))
        );

        for (let index: number = 0; index < 4; index += 1) {
            await harness.inCompany(account.company.id, async () => llm.generate(same));
        }

        await expect(harness.inCompany(account.company.id, async () => llm.generate(same))).rejects.toMatchObject({
            code: 'ai.repeated_request',
            status: 429
        });
    });
});
