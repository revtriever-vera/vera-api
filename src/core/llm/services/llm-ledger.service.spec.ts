import { describe, expect, it, vi } from 'vitest';
import { LlmCallDomain } from '../domain/llm-call.domain';
import { LlmUsagePort } from '../ports/llm-usage.port';
import { LlmLedgerEntry, LlmLedgerService } from './llm-ledger.service';
import { LlmLogService } from './llm-log.service';
import { LlmMetricsService } from './llm-metrics.service';

const ENTRY: LlmLedgerEntry = {
    callId: 'call-1',
    task: 'summary_month',
    feature: 'ai',
    driver: 'gateway',
    modelId: 'vendor/model-a',
    servedModelId: null,
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5 },
    costMicros: 1500,
    gatewayCostMicros: 1000,
    estimateMicros: 2000,
    latencyMs: 90,
    attempts: 1,
    outcome: 'answered',
    requestHash: 'hash',
    referenceId: 'ref'
};

function build(usage: LlmUsagePort | null = null) {
    const calls = { record: vi.fn().mockResolvedValue({}), answeredSince: vi.fn().mockResolvedValue(2) };
    const port = usage ?? { assertRoom: vi.fn().mockResolvedValue(undefined), record: vi.fn().mockResolvedValue(undefined) };
    const logs = { capReached: vi.fn(), bookkeepingFailed: vi.fn() };
    const metrics = { request: vi.fn(), tokens: vi.fn(), cost: vi.fn(), duration: vi.fn(), divergence: vi.fn() };
    const ledger: LlmLedgerService = new LlmLedgerService(
        calls as unknown as LlmCallDomain,
        logs as unknown as LlmLogService,
        metrics as unknown as LlmMetricsService,
        port
    );
    return {
        ledger,
        calls,
        port: port as unknown as { assertRoom: ReturnType<typeof vi.fn>; record: ReturnType<typeof vi.fn> },
        logs,
        metrics
    };
}

describe('LlmLedgerService', () => {
    it('grava a chamada sem conteúdo e lança o custo na cota com o detalhe do modelo e dos tokens', async () => {
        const { ledger, calls, port, metrics } = build();

        await ledger.record(ENTRY);

        expect(calls.record).toHaveBeenCalledWith(
            expect.objectContaining({ callId: 'call-1', inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, requestHash: 'hash' })
        );
        expect(JSON.stringify(calls.record.mock.calls)).not.toContain('prompt');
        expect(port.record).toHaveBeenCalledWith({
            feature: 'ai',
            task: 'summary_month',
            referenceId: 'call-1',
            costMicros: 1500,
            estimateMicros: 2000,
            outcome: 'answered',
            providerCostMicros: 1000,
            detail: { model: 'vendor/model-a', inputTokens: 100, outputTokens: 20 }
        });
        expect(metrics.request).toHaveBeenCalledWith('summary_month', 'gateway', 'answered');
        expect(metrics.divergence).toHaveBeenCalledWith('summary_month', 5000);
    });

    it('tarefa fora da cota grava a chamada e as métricas, mas não lança custo na cota', async () => {
        const { ledger, calls, port, metrics } = build();

        await ledger.record({ ...ENTRY, outsideCap: true });

        expect(calls.record).toHaveBeenCalledTimes(1);
        expect(metrics.cost).toHaveBeenCalledWith('summary_month', 'ai', 1500);
        expect(port.record).not.toHaveBeenCalled();
    });

    it('falha do provedor lança custo zero como não respondida', async () => {
        const { ledger, port } = build();

        await ledger.record({ ...ENTRY, outcome: 'failed', costMicros: 0, gatewayCostMicros: null });

        expect(port.record).toHaveBeenCalledWith(expect.objectContaining({ costMicros: 0, outcome: 'unanswered' }));
        expect(port.record.mock.calls[0]?.[0]).not.toHaveProperty('providerCostMicros');
    });

    it('cap_reached grava a chamada, loga e não lança custo', async () => {
        const { ledger, calls, port, logs } = build();

        await ledger.record({ ...ENTRY, outcome: 'cap_reached', costMicros: 0 });

        expect(calls.record).toHaveBeenCalled();
        expect(port.record).not.toHaveBeenCalled();
        expect(logs.capReached).toHaveBeenCalledWith('summary_month', 'ai');
    });

    it('sem custo do gateway não mede divergência', async () => {
        const { ledger, metrics } = build();

        await ledger.record({ ...ENTRY, gatewayCostMicros: null });
        await ledger.record({ ...ENTRY, gatewayCostMicros: 0 });

        expect(metrics.divergence).not.toHaveBeenCalled();
    });

    it('falha ao gravar não derruba a resposta já cobrada: loga e segue para a cota', async () => {
        const { ledger, calls, port, logs } = build();
        calls.record.mockRejectedValue(new Error('db'));
        port.record.mockRejectedValue(new Error('usage'));

        await expect(ledger.record(ENTRY)).resolves.toBeUndefined();

        expect(logs.bookkeepingFailed).toHaveBeenCalledWith('summary_month', 'call', expect.any(Error));
        expect(logs.bookkeepingFailed).toHaveBeenCalledWith('summary_month', 'usage', expect.any(Error));
    });

    it('delega a folga e a contagem de repetição', async () => {
        const { ledger, port, calls } = build();

        await ledger.assertRoom('ai', 'summary_month', 7);
        const answered: number = await ledger.answeredSince('hash', new Date(0));

        expect(port.assertRoom).toHaveBeenCalledWith({ feature: 'ai', task: 'summary_month', estimateMicros: 7 });
        expect(answered).toBe(2);
        expect(calls.answeredSince).toHaveBeenCalled();
    });

    it('sem porta de cota usa a nula', async () => {
        const ledger: LlmLedgerService = new LlmLedgerService(
            { record: vi.fn() } as unknown as LlmCallDomain,
            { bookkeepingFailed: vi.fn() } as unknown as LlmLogService,
            { request: vi.fn(), tokens: vi.fn(), cost: vi.fn(), duration: vi.fn(), divergence: vi.fn() } as unknown as LlmMetricsService,
            null
        );

        await expect(ledger.assertRoom('ai', 't', 1)).resolves.toBeUndefined();
        await expect(ledger.record(ENTRY)).resolves.toBeUndefined();
    });
});
