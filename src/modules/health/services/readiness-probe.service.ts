import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { HealthService, Readiness } from './health.service';

const LOG_IDENTIFIER: string = 'health-readiness';
const READINESS_METRIC: string = 'readiness_degraded';
const PROBE_INTERVAL_MS: number = 30_000;

@Injectable()
export class ReadinessProbeService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | null = null;
    private lastStatus: Readiness['status'] | null = null;

    public constructor(
        private readonly health: HealthService,
        private readonly metrics: MetricsService,
        private readonly logs: LogService
    ) {}

    public onApplicationBootstrap(): void {
        this.timer = setInterval(() => {
            void this.probe();
        }, PROBE_INTERVAL_MS);
        this.timer.unref();
    }

    public onModuleDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    public async probe(): Promise<Readiness> {
        const readiness: Readiness = await this.health.readiness();
        this.metrics.gauge(READINESS_METRIC, readiness.status === 'ok' ? 0 : 1);
        this.announce(readiness);
        return readiness;
    }

    private announce(readiness: Readiness): void {
        if (readiness.status === this.lastStatus) {
            return;
        }
        this.lastStatus = readiness.status;
        this.logs.warn({
            message: 'readiness changed',
            identifier: LOG_IDENTIFIER,
            meta: { status: readiness.status, database: readiness.checks.database }
        });
    }
}
