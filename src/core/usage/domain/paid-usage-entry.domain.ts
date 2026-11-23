import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import { PaidUsageEntriesRepository } from '../repositories/paid-usage-entries.repository';
import { CompanyUsage, FeatureMicros, PeriodFeatureTotal, RecordUsageInput, UsageDetail } from '../usage.types';

export interface EntryDraft {
    readonly input: RecordUsageInput;
    readonly period: string;
    readonly costMicros: number;
    readonly detail: UsageDetail | null;
    readonly occurredAt: Date;
}

@Injectable()
export class PaidUsageEntryDomain {
    public constructor(private readonly entries: PaidUsageEntriesRepository) {}

    public async insertIfAbsent(draft: EntryDraft): Promise<boolean> {
        return this.entries.insertIfAbsent({
            id: IdUtil.newId(),
            period: draft.period,
            feature: draft.input.feature,
            task: draft.input.task,
            referenceId: draft.input.referenceId,
            costMicros: draft.costMicros,
            providerCostMicros: draft.input.providerCostMicros ?? null,
            usdBrlRate: draft.input.usdBrlRate ?? null,
            outcome: draft.input.outcome,
            detail: draft.detail === null ? null : JSON.stringify(draft.detail),
            occurredAt: draft.occurredAt
        });
    }

    public async totalsByFeature(period: string): Promise<FeatureMicros> {
        return this.entries.totalsByFeature(period);
    }

    public async aggregateSince(oldestPeriod: string): Promise<PeriodFeatureTotal[]> {
        return this.entries.aggregateSince(oldestPeriod);
    }

    public async companiesWithUsage(period: string): Promise<CompanyUsage[]> {
        return this.entries.companiesWithUsage(period);
    }

    public async eraseAll(): Promise<number> {
        return this.entries.eraseAll();
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        return this.entries.purgeBefore(cutoff);
    }
}
