import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../context/app-context.port';
import { PaidUsageEntryDomain } from '../domain/paid-usage-entry.domain';
import { PaidUsageNoticeDomain } from '../domain/paid-usage-notice.domain';
import { UsageContextHolder } from '../ports/usage-context.holder';
import { UsageState } from '../usage.types';
import { PaidUsageMeter } from './paid-usage-meter.service';
import { UsageLogService } from './usage-log.service';
import { UsageMetricsService } from './usage-metrics.service';
import { UsageSnapshotService } from './usage-snapshot.service';

function stateOf(overrides: Partial<UsageState>): UsageState {
    return {
        period: '2026-10',
        capMicros: 4_000_000,
        usedMicros: 0,
        usedBps: 0,
        byFeature: { ai: 0, whatsapp: 0, help: 0 },
        state: 'ok',
        resetsAt: '2026-11-01T03:00:00.000Z',
        ...overrides
    };
}

function build(state: UsageState, inserted: boolean = true, claimed: boolean = true) {
    const entries = { insertIfAbsent: vi.fn().mockResolvedValue(inserted) };
    const notices = { claim: vi.fn().mockResolvedValue(claimed) };
    const snapshots = { state: vi.fn().mockResolvedValue(state), invalidate: vi.fn() };
    const publisher = { publish: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };
    const logs = { capReached: vi.fn(), recordedAboveEstimate: vi.fn(), thresholdCrossed: vi.fn() };
    const metrics = { cost: vi.fn(), capReached: vi.fn(), overshoot: vi.fn() };
    const meter: PaidUsageMeter = new PaidUsageMeter(
        entries as unknown as PaidUsageEntryDomain,
        notices as unknown as PaidUsageNoticeDomain,
        snapshots as unknown as UsageSnapshotService,
        { timezone: vi.fn().mockResolvedValue('America/Sao_Paulo') } as unknown as UsageContextHolder,
        publisher,
        { get: vi.fn().mockReturnValue({ requestId: 'r', companyId: 'company-1' }) } as unknown as AppContext,
        logs as unknown as UsageLogService,
        metrics as unknown as UsageMetricsService
    );
    return { meter, entries, notices, snapshots, publisher, logs, metrics };
}

const INPUT = { feature: 'ai', task: 'summary', referenceId: 'ref-1', costMicros: 1000, outcome: 'answered' } as const;

describe('PaidUsageMeter.assertRoom', () => {
    it('passa com folga e sem teto', async () => {
        await expect(
            build(stateOf({ usedMicros: 1_000_000 })).meter.assertRoom({ feature: 'ai', task: 't', estimateMicros: 500 })
        ).resolves.toBeUndefined();
        await expect(
            build(stateOf({ capMicros: null })).meter.assertRoom({ feature: 'ai', task: 't', estimateMicros: 9e9 })
        ).resolves.toBeUndefined();
    });

    it('recusa com restante zero e com estimativa maior que o restante, dando o resetsAt', async () => {
        const full = build(stateOf({ usedMicros: 4_000_000, state: 'paused' }));
        const tight = build(stateOf({ usedMicros: 3_999_000 }));

        await expect(full.meter.assertRoom({ feature: 'ai', task: 't', estimateMicros: 0 })).rejects.toMatchObject({
            code: 'usage.cap_reached',
            status: 429,
            meta: { feature: 'ai', resetsAt: '2026-11-01T03:00:00.000Z' }
        });
        await expect(tight.meter.assertRoom({ feature: 'whatsapp', task: 't', estimateMicros: 1001 })).rejects.toMatchObject({
            code: 'usage.cap_reached'
        });
        await expect(tight.meter.assertRoom({ feature: 'whatsapp', task: 't', estimateMicros: 1000 })).resolves.toBeUndefined();
        expect(full.logs.capReached).toHaveBeenCalledWith('ai', 't', '2026-10');
        expect(full.metrics.capReached).toHaveBeenCalledWith('ai');
    });
});

describe('PaidUsageMeter.record', () => {
    it('grava, invalida o cache e conta o custo; sem cruzar nada não avisa', async () => {
        const { meter, entries, snapshots, publisher, metrics } = build(stateOf({ usedMicros: 1000 }));

        await meter.record(INPUT);

        expect(entries.insertIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ costMicros: 1000, detail: null }));
        expect(snapshots.invalidate).toHaveBeenCalled();
        expect(metrics.cost).toHaveBeenCalledWith('ai', 'summary', 1000);
        expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('referência repetida não faz mais nada', async () => {
        const { meter, snapshots, metrics } = build(stateOf({}), false);

        await meter.record(INPUT);

        expect(snapshots.invalidate).not.toHaveBeenCalled();
        expect(metrics.cost).not.toHaveBeenCalled();
    });

    it('chamada sem resposta grava custo zero', async () => {
        const { meter, entries } = build(stateOf({}));

        await meter.record({ ...INPUT, outcome: 'unanswered' });

        expect(entries.insertIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ costMicros: 0 }));
    });

    it('cruzar o aviso publica um aviso com jobId determinístico', async () => {
        const { meter, notices, publisher } = build(stateOf({ usedMicros: 3_400_000, usedBps: 8500, state: 'warning' }));

        await meter.record(INPUT);

        expect(notices.claim).toHaveBeenCalledWith('2026-10', 'warning');
        expect(publisher.publish).toHaveBeenCalledWith(
            'vera-usage',
            'usage.threshold.crossed',
            { period: '2026-10', kind: 'warning', usedBps: 8500 },
            { jobId: 'usage-notice-company-1-2026-10-warning' }
        );
    });

    it('pausar publica o paused; aviso já enviado não publica de novo', async () => {
        const paused = build(stateOf({ usedMicros: 4_100_000, usedBps: 10250, state: 'paused' }));
        const repeated = build(stateOf({ usedMicros: 4_100_000, state: 'paused' }), true, false);

        await paused.meter.record(INPUT);
        await repeated.meter.record(INPUT);

        expect(paused.notices.claim).toHaveBeenCalledWith('2026-10', 'paused');
        expect(paused.publisher.publish).toHaveBeenCalledTimes(1);
        expect(paused.metrics.overshoot).toHaveBeenCalledWith(1000);
        expect(repeated.publisher.publish).not.toHaveBeenCalled();
    });

    it('custo acima da estimativa avisa em warn', async () => {
        const { meter, logs } = build(stateOf({}));

        await meter.record({ ...INPUT, estimateMicros: 500 });
        await meter.record({ ...INPUT, referenceId: 'ref-2', estimateMicros: 1000 });

        expect(logs.recordedAboveEstimate).toHaveBeenCalledTimes(1);
        expect(logs.recordedAboveEstimate).toHaveBeenCalledWith('summary', 500, 1000);
    });

    it('recusa detail fora do schema antes de gravar', async () => {
        const { meter, entries } = build(stateOf({}));

        await expect(meter.record({ ...INPUT, detail: { text: 'livre' } as never })).rejects.toMatchObject({
            code: 'usage.invalid_detail'
        });
        expect(entries.insertIfAbsent).not.toHaveBeenCalled();
    });
});
