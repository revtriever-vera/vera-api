import { Injectable } from '@nestjs/common';
import { PaidUsageEntryDomain } from '../domain/paid-usage-entry.domain';
import { PaidUsageNoticeDomain } from '../domain/paid-usage-notice.domain';
import { UsageContextHolder } from '../ports/usage-context.holder';
import { oldestPeriodOf, periodOf, retentionCutoffOf } from '../usage-period';
import { CompanyUsage, EXPORT_MONTHS_BACK, PeriodFeatureTotal, RETENTION_MONTHS } from '../usage.types';
import { UsageSnapshotService } from './usage-snapshot.service';

@Injectable()
export class PaidUsageHistoryService {
    public constructor(
        private readonly entries: PaidUsageEntryDomain,
        private readonly notices: PaidUsageNoticeDomain,
        private readonly holder: UsageContextHolder,
        private readonly snapshots: UsageSnapshotService
    ) {}

    public async aggregateForExport(now: Date = new Date()): Promise<PeriodFeatureTotal[]> {
        const current: string = periodOf(now, await this.holder.timezone());
        return this.entries.aggregateSince(oldestPeriodOf(current, EXPORT_MONTHS_BACK));
    }

    public async eraseAll(): Promise<number> {
        const erased: number = (await this.entries.eraseAll()) + (await this.notices.eraseAll());
        this.snapshots.invalidate();
        return erased;
    }

    public async companiesWithUsage(period: string): Promise<CompanyUsage[]> {
        return this.entries.companiesWithUsage(period);
    }

    public async purgeExpired(now: Date = new Date()): Promise<number> {
        return this.entries.purgeBefore(retentionCutoffOf(now, RETENTION_MONTHS));
    }
}
