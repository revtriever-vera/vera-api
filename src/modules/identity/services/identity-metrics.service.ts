import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { LoginOutcome, LoginProvider, RefreshOutcome } from '../domain/identity.types';

const REFRESH_TOTAL: string = 'vera_auth_refresh_total';
const LOGINS_TOTAL: string = 'vera_auth_logins_total';
const PROVIDER_LATENCY: string = 'vera_auth_provider_latency_seconds';

@Injectable()
export class IdentityMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public refresh(outcome: RefreshOutcome): void {
        this.metrics.count(REFRESH_TOTAL, { outcome });
    }

    public login(provider: LoginProvider, outcome: LoginOutcome): void {
        this.metrics.count(LOGINS_TOTAL, { provider, outcome });
    }

    public providerLatency(provider: LoginProvider, seconds: number): void {
        this.metrics.observe(PROVIDER_LATENCY, seconds, { provider });
    }
}
