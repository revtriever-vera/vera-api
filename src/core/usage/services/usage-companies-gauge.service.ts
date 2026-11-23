import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../context/as-company.decorator';
import { periodOf } from '../usage-period';
import { UsageState, USAGE_STATES, UsageStateKey } from '../usage.types';
import { PaidUsageHistoryService } from './paid-usage-history.service';
import { PaidUsageMeter } from './paid-usage-meter.service';
import { UsageMetricsService } from './usage-metrics.service';
import { DateUtil } from '../../../shared/utils/date.util';

@Injectable()
export class UsageCompaniesGaugeService {
    public constructor(
        private readonly history: PaidUsageHistoryService,
        private readonly meter: PaidUsageMeter,
        private readonly metrics: UsageMetricsService
    ) {}

    public async publish(now: Date = new Date()): Promise<void> {
        const period: string = periodOf(now, DateUtil.BRAZIL_TIMEZONE);
        const totals: Record<UsageStateKey, number> = { ok: 0, warning: 0, paused: 0 };
        for (const company of await this.history.companiesWithUsage(period)) {
            totals[await this.stateOf(company.companyId)] += 1;
        }
        for (const key of Object.values(USAGE_STATES)) {
            this.metrics.companies(key, totals[key]);
        }
    }

    @AsCompany()
    private async stateOf(_companyId: string): Promise<UsageStateKey> {
        const state: UsageState = await this.meter.state();
        return state.state;
    }
}
