import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { RefreshOutcome } from '../domain/identity.types';

const REFRESH_TOTAL: string = 'vera_auth_refresh_total';

@Injectable()
export class IdentityMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public refresh(outcome: RefreshOutcome): void {
        this.metrics.count(REFRESH_TOTAL, { outcome });
    }
}
