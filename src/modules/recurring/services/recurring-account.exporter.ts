import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { RecurrenceTransaction, TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { RecurringAlertsDomain } from '../domain/recurring-alerts.domain';
import { AlertRecord } from '../domain/recurring-alerts.types';
import { ExportedSuppression, RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringSeriesRecord, StoredCharge } from '../domain/recurring-series.types';

export const RECURRING_EXPORT_AREA: string = 'recurring';

const TRANSACTION_CHUNK: number = 5000;

export interface RecurringChargeExport {
    readonly date: string;
    readonly amountMinor: number;
    readonly role: string;
}

export interface RecurringSeriesExport {
    readonly name: string;
    readonly merchantKey: string;
    readonly account: string;
    readonly kind: string;
    readonly cadence: string;
    readonly valueMode: string;
    readonly status: string;
    readonly origin: string;
    readonly typicalAmountMinor: number;
    readonly minAmountMinor: number;
    readonly maxAmountMinor: number;
    readonly expectedDay: number | null;
    readonly firstDate: string;
    readonly lastDate: string;
    readonly snoozedUntil: string | null;
    readonly confirmedAt: string | null;
    readonly dismissedAt: string | null;
    readonly stoppedAt: string | null;
    readonly stoppedBy: string | null;
    readonly charges: RecurringChargeExport[];
}

export interface RecurringSuppressionExport {
    readonly merchantKey: string;
    readonly typicalAmountMinor: number;
    readonly createdAt: string;
}

export interface RecurringAlertExport {
    readonly series: string;
    readonly kind: string;
    readonly occurredOn: string;
    readonly seen: boolean;
    readonly data: Readonly<Record<string, string | number>>;
}

export interface RecurringExport {
    readonly series: RecurringSeriesExport[];
    readonly suppressions: RecurringSuppressionExport[];
    readonly alerts: RecurringAlertExport[];
}

type Amounts = Pick<RecurringSeriesExport, 'typicalAmountMinor' | 'minAmountMinor' | 'maxAmountMinor' | 'expectedDay'>;
type Dates = Pick<
    RecurringSeriesExport,
    'firstDate' | 'lastDate' | 'snoozedUntil' | 'confirmedAt' | 'dismissedAt' | 'stoppedAt' | 'stoppedBy'
>;

function amountsOf(record: RecurringSeriesRecord): Amounts {
    return {
        typicalAmountMinor: record.typicalAmountMinor,
        minAmountMinor: record.minAmountMinor,
        maxAmountMinor: record.maxAmountMinor,
        expectedDay: record.expectedDay
    };
}

function datesOf(record: RecurringSeriesRecord): Dates {
    return {
        firstDate: record.firstDate,
        lastDate: record.lastDate,
        snoozedUntil: record.snoozedUntil,
        confirmedAt: isoOf(record.confirmedAt),
        dismissedAt: isoOf(record.dismissedAt),
        stoppedAt: isoOf(record.stoppedAt),
        stoppedBy: record.stoppedBy
    };
}

function isoOf(value: Date | null): string | null {
    return value === null ? null : value.toISOString();
}

@Injectable()
export class RecurringAccountExporter extends AccountDataExporterPort {
    public readonly area: string = RECURRING_EXPORT_AREA;

    public constructor(
        private readonly series: RecurringSeriesDomain,
        private readonly alerts: RecurringAlertsDomain,
        private readonly accounts: FinancialAccountService,
        private readonly reader: TransactionReaderService
    ) {
        super();
    }

    public async exportAll(): Promise<RecurringExport> {
        const accounts: ReadonlyMap<string, FinancialAccount> = new Map<string, FinancialAccount>(
            (await this.accounts.list()).map((account: FinancialAccount): [string, FinancialAccount] => [account.id, account])
        );
        const real: RecurringSeriesRecord[] = (await this.series.list()).filter(
            (record: RecurringSeriesRecord): boolean => accounts.get(record.accountId)?.isSample === false
        );
        const ids: ReadonlySet<string> = new Set<string>(real.map((record: RecurringSeriesRecord): string => record.id));
        const charges: ReadonlyMap<string, RecurringChargeExport[]> = await this.chargesOf(ids);
        return {
            series: real.map((record: RecurringSeriesRecord): RecurringSeriesExport => this.seriesOf(record, accounts, charges)),
            suppressions: await this.suppressionsOf(ids),
            alerts: this.alertsOf(await this.alerts.list(), real)
        };
    }

    private async suppressionsOf(seriesIds: ReadonlySet<string>): Promise<RecurringSuppressionExport[]> {
        return (await this.series.exportSuppressions())
            .filter((item: ExportedSuppression): boolean => item.seriesId === null || seriesIds.has(item.seriesId))
            .map((item: ExportedSuppression): RecurringSuppressionExport => ({
                merchantKey: item.merchantKey,
                typicalAmountMinor: item.typicalAmountMinor,
                createdAt: item.createdAt.toISOString()
            }));
    }

    private seriesOf(
        record: RecurringSeriesRecord,
        accounts: ReadonlyMap<string, FinancialAccount>,
        charges: ReadonlyMap<string, RecurringChargeExport[]>
    ): RecurringSeriesExport {
        return {
            name: record.name,
            merchantKey: record.merchantKey,
            account: accounts.get(record.accountId)?.name ?? '',
            kind: record.kind,
            cadence: record.cadence,
            valueMode: record.valueMode,
            status: record.status,
            origin: record.origin,
            ...amountsOf(record),
            ...datesOf(record),
            charges: charges.get(record.id) ?? []
        };
    }

    private alertsOf(alerts: readonly AlertRecord[], real: readonly RecurringSeriesRecord[]): RecurringAlertExport[] {
        const names: ReadonlyMap<string, string> = new Map<string, string>(
            real.map((record: RecurringSeriesRecord): [string, string] => [record.id, record.name])
        );
        return alerts
            .filter((alert: AlertRecord): boolean => names.has(alert.seriesId))
            .map((alert: AlertRecord): RecurringAlertExport => ({
                series: names.get(alert.seriesId) ?? '',
                kind: alert.kind,
                occurredOn: alert.occurredOn,
                seen: alert.seenAt !== null,
                data: alert.data
            }));
    }

    private async chargesOf(seriesIds: ReadonlySet<string>): Promise<Map<string, RecurringChargeExport[]>> {
        const links: StoredCharge[] = (await this.series.exportCharges()).filter((link: StoredCharge): boolean =>
            seriesIds.has(link.seriesId)
        );
        const rows: ReadonlyMap<string, RecurrenceTransaction> = await this.transactionsOf(links);
        const grouped: Map<string, RecurringChargeExport[]> = new Map<string, RecurringChargeExport[]>();
        for (const link of links) {
            const row: RecurrenceTransaction | undefined = rows.get(link.transactionId);
            if (row !== undefined) {
                const list: RecurringChargeExport[] = grouped.get(link.seriesId) ?? [];
                list.push(this.chargeOf(row, link));
                grouped.set(link.seriesId, list);
            }
        }
        return new Map<string, RecurringChargeExport[]>(
            [...grouped].map(([seriesId, list]: [string, RecurringChargeExport[]]): [string, RecurringChargeExport[]] => [
                seriesId,
                list.toSorted((left: RecurringChargeExport, right: RecurringChargeExport): number => left.date.localeCompare(right.date))
            ])
        );
    }

    private chargeOf(row: RecurrenceTransaction, link: StoredCharge): RecurringChargeExport {
        return { date: row.date, amountMinor: row.amountMinor, role: link.role };
    }

    private async transactionsOf(links: readonly StoredCharge[]): Promise<Map<string, RecurrenceTransaction>> {
        const ids: string[] = links.map((link: StoredCharge): string => link.transactionId);
        const chunks: string[][] = Array.from(
            { length: Math.ceil(ids.length / TRANSACTION_CHUNK) },
            (_unused: unknown, index: number): string[] => ids.slice(index * TRANSACTION_CHUNK, (index + 1) * TRANSACTION_CHUNK)
        );
        const found: RecurrenceTransaction[][] = [];
        for (const chunk of chunks) {
            found.push(await this.reader.findForRecurrence(chunk));
        }
        return new Map<string, RecurrenceTransaction>(
            found.flat().map((row: RecurrenceTransaction): [string, RecurrenceTransaction] => [row.id, row])
        );
    }
}
