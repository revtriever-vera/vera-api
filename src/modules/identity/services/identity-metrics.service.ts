import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { AccountDeletionOutcome, AccountExportOutcome, LoginOutcome, LoginProvider, RefreshOutcome } from '../domain/identity.types';

const REFRESH_TOTAL: string = 'vera_auth_refresh_total';
const LOGINS_TOTAL: string = 'vera_auth_logins_total';
const EXPORTS_TOTAL: string = 'vera_account_exports_total';
const DELETIONS_TOTAL: string = 'vera_account_deletions_total';
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

    public accountExport(outcome: AccountExportOutcome): void {
        this.metrics.count(EXPORTS_TOTAL, { outcome });
    }

    public accountDeletion(outcome: AccountDeletionOutcome): void {
        this.metrics.count(DELETIONS_TOTAL, { outcome });
    }
}
