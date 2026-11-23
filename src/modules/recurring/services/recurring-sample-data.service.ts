import { Injectable } from '@nestjs/common';
import { SampleDataPort } from '../../onboarding/services/sample-data.port';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { RecurringAlertsDomain } from '../domain/recurring-alerts.domain';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringSeriesRecord } from '../domain/recurring-series.types';
import { RecurringDetectionService } from './recurring-detection.service';

/**
 * Sorts after the `spending` area on purpose: the registry seeds the areas in order, and the series are detected over
 * the example transactions that `spending` has just written. On clear the same order means the example accounts are
 * already gone, so the series left without a live account are the ones to remove.
 */
export const RECURRING_SAMPLE_AREA: string = 'spending-recurring';

@Injectable()
export class RecurringSampleDataService extends SampleDataPort {
    public readonly area: string = RECURRING_SAMPLE_AREA;

    public constructor(
        private readonly detection: RecurringDetectionService,
        private readonly series: RecurringSeriesDomain,
        private readonly alerts: RecurringAlertsDomain,
        private readonly accounts: FinancialAccountService
    ) {
        super();
    }

    public async seed(): Promise<number> {
        const accounts: FinancialAccount[] = await this.accounts.list();
        if (!accounts.some((account: FinancialAccount): boolean => account.isSample)) {
            return 0;
        }
        return (await this.detection.run()).created;
    }

    public async clear(): Promise<number> {
        const live: ReadonlySet<string> = new Set<string>(
            (await this.accounts.list()).map((account: FinancialAccount): string => account.id)
        );
        const orphans: string[] = [
            ...new Set<string>(
                (await this.series.list())
                    .filter((record: RecurringSeriesRecord): boolean => !live.has(record.accountId))
                    .map((record: RecurringSeriesRecord): string => record.accountId)
            )
        ];
        const removed: string[] = await this.series.removeOfAccounts(orphans);
        await this.alerts.removeOfSeries(removed);
        return removed.length;
    }
}
