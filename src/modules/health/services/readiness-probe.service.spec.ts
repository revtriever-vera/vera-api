import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { HealthService, Readiness } from './health.service';
import { ReadinessProbeService } from './readiness-probe.service';

interface Harness {
    readonly probe: ReadinessProbeService;
    readonly metrics: MetricsService;
    readonly warn: ReturnType<typeof vi.fn>;
}

function probeFor(states: boolean[]): Harness {
    const remaining: boolean[] = [...states];
    const health: HealthService = {
        readiness: async (): Promise<Readiness> => {
            const database: boolean = remaining.shift() ?? true;
            return Promise.resolve({ status: database ? 'ok' : 'degraded', checks: { database } });
        }
    } as unknown as HealthService;
    const metrics: MetricsService = new MetricsService();
    const warn: ReturnType<typeof vi.fn> = vi.fn();
    const logs: LogService = { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogService;
    return { probe: new ReadinessProbeService(health, metrics, logs), metrics, warn };
}

describe('ReadinessProbeService', () => {
    it('sets the gauge to 0 while ready and to 1 when the database is gone', async () => {
        const { probe, metrics }: Harness = probeFor([true, false]);

        await probe.probe();
        expect(metrics.gaugeValue('readiness_degraded')).toBe(0);

        await probe.probe();
        expect(metrics.gaugeValue('readiness_degraded')).toBe(1);
    });

    it('logs only the transitions, not every sample', async () => {
        const { probe, warn }: Harness = probeFor([true, true, false, false, true]);

        for (let sample: number = 0; sample < 5; sample += 1) {
            await probe.probe();
        }

        expect(warn).toHaveBeenCalledTimes(3);
        expect(warn).toHaveBeenLastCalledWith(expect.objectContaining({ meta: { status: 'ok', database: true } }));
    });

    it('starts an unref timer on bootstrap and clears it on destroy', () => {
        const { probe }: Harness = probeFor([true]);
        vi.useFakeTimers();

        probe.onApplicationBootstrap();
        expect(vi.getTimerCount()).toBe(1);
        probe.onModuleDestroy();
        expect(vi.getTimerCount()).toBe(0);

        vi.useRealTimers();
    });
});
