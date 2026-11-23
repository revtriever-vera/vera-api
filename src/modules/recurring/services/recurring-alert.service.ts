import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { deriveAlerts, chargesOfTransactions } from '../domain/recurring-alerts';
import { RecurringAlertsDomain } from '../domain/recurring-alerts.domain';
import { AlertSeries, DesiredAlert, SeriesCharges } from '../domain/recurring-alerts.types';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringSeriesRecord } from '../domain/recurring-series.types';
import { DetectorTransaction } from '../domain/recurring.types';
import { RecurringLogService } from './recurring-log.service';

const NO_CHARGES: SeriesCharges = { chargeIds: [], duplicateIds: [], trialIds: [] };

function alertSeriesOf(record: RecurringSeriesRecord, charges: SeriesCharges | undefined, timezone: string): AlertSeries {
    return {
        id: record.id,
        merchantKey: record.merchantKey,
        accountId: record.accountId,
        cadence: record.cadence,
        status: record.status,
        stoppedBy: record.stoppedBy,
        stoppedOn: record.stoppedAt === null ? null : DateUtil.localDateIn(timezone, record.stoppedAt),
        expectedDay: record.expectedDay,
        typicalAmountMinor: record.typicalAmountMinor,
        chargeIds: (charges ?? NO_CHARGES).chargeIds,
        duplicateIds: (charges ?? NO_CHARGES).duplicateIds,
        trialIds: (charges ?? NO_CHARGES).trialIds
    };
}

@Injectable()
export class RecurringAlertService {
    public constructor(
        private readonly series: RecurringSeriesDomain,
        private readonly alerts: RecurringAlertsDomain,
        private readonly timezones: CompanyTimezoneService,
        private readonly logs: RecurringLogService
    ) {}

    @UsingTransaction()
    public async refresh(transactions: readonly DetectorTransaction[], today: string): Promise<number> {
        await this.series.lockWrites();
        const timezone: string = await this.timezones.timezoneOfCompany();
        const records: RecurringSeriesRecord[] = await this.series.list();
        const charges: Map<string, SeriesCharges> = await this.series.chargesBySeries(null);
        const desired: DesiredAlert[] = deriveAlerts(
            records.map((record: RecurringSeriesRecord): AlertSeries => alertSeriesOf(record, charges.get(record.id), timezone)),
            chargesOfTransactions(transactions),
            today
        );
        await this.alerts.sync(desired);
        this.logs.alertsSynced(desired.length);
        return desired.length;
    }
}
