import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { PortfolioIncomeLedgerDomain } from '../domain/portfolio-income-ledger.domain';
import { PortfolioMonthlySnapshotDomain } from '../domain/portfolio-monthly-snapshot.domain';
import { EXPORT_PAGE, IncomeLedgerRow, MonthlySnapshotRow } from '../domain/portfolio-watch.types';

export const PORTFOLIO_WATCH_EXPORT_AREA: string = 'portfolio-watch';

export interface MonthlySnapshotExport {
    readonly month: string;
    readonly assetId: string;
    readonly holdingKind: string;
    readonly classId: string | null;
    readonly quantity: string | null;
    readonly price: string | null;
    readonly priceDate: string | null;
    readonly valueMinor: number;
    readonly currency: string;
}

export interface IncomeLedgerExport {
    readonly eventId: string;
    readonly assetId: string;
    readonly quantityAtExDate: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly paymentDate: string | null;
}

export interface PortfolioWatchExport {
    readonly monthlySnapshots: MonthlySnapshotExport[];
    readonly incomeLedger: IncomeLedgerExport[];
}

async function drain<T>(read: (offset: number, limit: number) => Promise<T[]>): Promise<T[]> {
    const all: T[] = [];
    let page: T[] = await read(0, EXPORT_PAGE);
    while (page.length > 0) {
        all.push(...page);
        page = await read(all.length, EXPORT_PAGE);
    }
    return all;
}

function dateOf(value: Date | null): string | null {
    return value === null ? null : DateUtil.onlyLocalDateString(new Date(value));
}

@Injectable()
export class PortfolioWatchAccountExporter extends AccountDataExporterPort {
    public readonly area: string = PORTFOLIO_WATCH_EXPORT_AREA;

    public constructor(
        private readonly snapshots: PortfolioMonthlySnapshotDomain,
        private readonly ledger: PortfolioIncomeLedgerDomain
    ) {
        super();
    }

    public async exportAll(_companyId: string): Promise<PortfolioWatchExport> {
        const snapshots: MonthlySnapshotRow[] = await drain((offset: number, limit: number) => this.snapshots.listPage(offset, limit));
        const ledger: IncomeLedgerRow[] = await drain((offset: number, limit: number) => this.ledger.listPage(offset, limit));
        return {
            monthlySnapshots: snapshots.map((row: MonthlySnapshotRow): MonthlySnapshotExport => this.snapshotOf(row)),
            incomeLedger: ledger.map((row: IncomeLedgerRow): IncomeLedgerExport => this.ledgerOf(row))
        };
    }

    private snapshotOf(row: MonthlySnapshotRow): MonthlySnapshotExport {
        return {
            month: row.month,
            assetId: row.assetId,
            holdingKind: row.holdingKind,
            classId: row.classId,
            quantity: row.quantity,
            price: row.price,
            priceDate: dateOf(row.priceDate),
            valueMinor: Number(row.valueMinor),
            currency: row.currency
        };
    }

    private ledgerOf(row: IncomeLedgerRow): IncomeLedgerExport {
        return {
            eventId: row.eventId,
            assetId: row.assetId,
            quantityAtExDate: row.quantityAtExDate,
            amountMinor: Number(row.amountMinor),
            currency: row.currency,
            paymentDate: dateOf(row.paymentDate)
        };
    }
}
