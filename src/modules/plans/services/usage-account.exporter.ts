import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { PaidUsageHistoryService } from '../../../core/usage/services/paid-usage-history.service';
import { PeriodFeatureTotal } from '../../../core/usage/usage.types';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';

export const USAGE_EXPORT_AREA: string = 'usage';

export interface UsageExport {
    readonly period: string;
    readonly feature: string;
    readonly costMicros: number;
    readonly entries: number;
}

@Injectable()
export class UsageAccountExporter extends AccountDataExporterPort {
    public readonly area: string = USAGE_EXPORT_AREA;

    public constructor(private readonly history: PaidUsageHistoryService) {
        super();
    }

    @AsCompany()
    public async exportAll(_companyId: string): Promise<UsageExport[]> {
        const totals: PeriodFeatureTotal[] = await this.history.aggregateForExport();
        return totals.map((total: PeriodFeatureTotal): UsageExport => ({
            period: total.period,
            feature: total.feature,
            costMicros: total.costMicros,
            entries: total.entries
        }));
    }
}
