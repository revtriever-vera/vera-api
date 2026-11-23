import { Injectable } from '@nestjs/common';
import { RecurringChargesRepository } from '../repositories/recurring-charges.repository';
import { RecurringSeriesRepository } from '../repositories/recurring-series.repository';
import { RecurringSuppressionsRepository } from '../repositories/recurring-suppressions.repository';
import { toRecord } from './recurring-series.mapper';
import { InvalidSeriesStateError, SeriesLimitReachedError, SeriesNotFoundError } from './recurring.errors';
import {
    CHARGE_ROLES,
    ChargeRow,
    DesiredCharge,
    DetectedFields,
    DerivedFields,
    MAX_SERIES_PER_COMPANY,
    NewSeries,
    RecurringSeriesRecord,
    SERIES_STATUSES,
    SeriesEdits,
    SeriesFields,
    SeriesPatch,
    SeriesRow,
    SeriesStatus,
    StoppedBy,
    StoredCharge,
    StoredSeries,
    StoredSuppression,
    SuppressionRow
} from './recurring-series.types';
import { diffCharges } from './series-sync';

interface DerivedColumns {
    readonly typicalAmountMinor: number;
    readonly minAmountMinor: number;
    readonly maxAmountMinor: number;
    readonly dayChangeFrom: number | null;
    readonly dayChangeTo: number | null;
    readonly knownSubscription: boolean;
    readonly firstDate: string;
    readonly lastDate: string;
}

function patchOfFields(fields: DerivedFields): DerivedColumns {
    return {
        typicalAmountMinor: fields.typicalAmountMinor,
        minAmountMinor: fields.minAmountMinor,
        maxAmountMinor: fields.maxAmountMinor,
        dayChangeFrom: fields.dayChange?.fromDay ?? null,
        dayChangeTo: fields.dayChange?.toDay ?? null,
        knownSubscription: fields.knownSubscription,
        firstDate: fields.firstDate,
        lastDate: fields.lastDate
    };
}

function insertOf(fields: SeriesFields): Omit<NewSeries, 'id' | 'companyId'> {
    return {
        name: fields.name,
        merchantKey: fields.merchantKey,
        accountId: fields.accountId,
        cadence: fields.cadence,
        valueMode: fields.valueMode,
        kind: fields.kind,
        status: fields.status,
        origin: fields.origin,
        expectedDay: fields.expectedDay,
        confirmedAt: fields.confirmedAt,
        ...patchOfFields(fields)
    };
}

function storedChargeOf(row: ChargeRow): StoredCharge {
    return { id: row.id, seriesId: row.seriesId, transactionId: row.transactionId, role: row.role as StoredCharge['role'] };
}

function editsPatch(edits: SeriesEdits): SeriesPatch {
    return {
        name: edits.name,
        cadence: edits.cadence,
        expectedDay: edits.expectedDay,
        valueMode: edits.valueMode,
        kind: edits.kind
    };
}

@Injectable()
export class RecurringSeriesDomain {
    public constructor(
        private readonly series: RecurringSeriesRepository,
        private readonly charges: RecurringChargesRepository,
        private readonly suppressions: RecurringSuppressionsRepository
    ) {}

    public async companyIdsWithConfirmedAcrossTenants(): Promise<string[]> {
        return this.series.companyIdsWithConfirmedAcrossTenants();
    }

    public async lockWrites(): Promise<void> {
        await this.series.lockWrites();
    }

    public async list(): Promise<RecurringSeriesRecord[]> {
        return (await this.series.listAll()).map(toRecord);
    }

    public async find(id: string): Promise<RecurringSeriesRecord | null> {
        const row: SeriesRow | null = await this.series.findById(id);
        return row === null ? null : toRecord(row);
    }

    public async require(id: string): Promise<RecurringSeriesRecord> {
        const found: RecurringSeriesRecord | null = await this.find(id);
        if (found === null) {
            throw new SeriesNotFoundError(id);
        }
        return found;
    }

    public async stored(): Promise<StoredSeries[]> {
        const records: RecurringSeriesRecord[] = await this.list();
        const rows: ChargeRow[] = await this.charges.listAll();
        const chargeIds: Map<string, Set<string>> = new Map<string, Set<string>>();
        for (const row of rows) {
            if (row.role === CHARGE_ROLES.charge) {
                chargeIds.set(row.seriesId, (chargeIds.get(row.seriesId) ?? new Set<string>()).add(row.transactionId));
            }
        }
        return records.map((record: RecurringSeriesRecord): StoredSeries => ({
            id: record.id,
            status: record.status,
            merchantKey: record.merchantKey,
            accountId: record.accountId,
            cadence: record.cadence,
            typicalAmountMinor: record.typicalAmountMinor,
            lastDate: record.lastDate,
            stoppedBy: record.stoppedBy,
            chargeIds: chargeIds.get(record.id) ?? new Set<string>()
        }));
    }

    public async storedSuppressions(): Promise<StoredSuppression[]> {
        const rows: SuppressionRow[] = await this.suppressions.listAll();
        return rows.map((row: SuppressionRow): StoredSuppression => ({
            merchantKey: row.merchantKey,
            typicalAmountMinor: Number(row.typicalAmountMinor)
        }));
    }

    public async excludedTransactionIds(): Promise<string[]> {
        return this.charges.listExcludedTransactionIds();
    }

    public async seriesOfTransaction(transactionId: string): Promise<string[]> {
        const rows: ChargeRow[] = await this.charges.findByTransaction(transactionId);
        return rows.filter((row: ChargeRow): boolean => row.role === CHARGE_ROLES.charge).map((row: ChargeRow): string => row.seriesId);
    }

    public async chargeTransactionIds(seriesId: string): Promise<string[]> {
        const rows: ChargeRow[] = await this.charges.listBySeries(seriesId);
        return rows
            .filter((row: ChargeRow): boolean => row.role === CHARGE_ROLES.charge)
            .map((row: ChargeRow): string => row.transactionId);
    }

    public async create(fields: SeriesFields, charges: readonly DesiredCharge[]): Promise<RecurringSeriesRecord> {
        if ((await this.series.countAll()) >= MAX_SERIES_PER_COMPANY) {
            throw new SeriesLimitReachedError(MAX_SERIES_PER_COMPANY);
        }
        const row: SeriesRow = await this.series.insert(insertOf(fields));
        await this.charges.insertMany(row.id, charges);
        return toRecord(row);
    }

    public async refreshSuggested(id: string, detected: DetectedFields, charges: readonly DesiredCharge[]): Promise<void> {
        await this.series.patch(id, {
            ...patchOfFields(detected),
            cadence: detected.cadence,
            valueMode: detected.valueMode,
            expectedDay: detected.expectedDay,
            accountId: detected.accountId,
            kind: detected.kind
        });
        await this.syncCharges(id, charges);
    }

    public async refreshReviewed(
        id: string,
        derived: DerivedFields,
        charges: readonly DesiredCharge[],
        reactivate: boolean
    ): Promise<void> {
        const reactivation: SeriesPatch = reactivate ? { status: SERIES_STATUSES.confirmed, stoppedAt: null, stoppedBy: null } : {};
        await this.series.patch(id, { ...patchOfFields(derived), ...reactivation });
        await this.syncCharges(id, charges);
    }

    public async confirm(id: string, edits: Required<Omit<SeriesEdits, 'valueMode'>>, now: Date): Promise<RecurringSeriesRecord> {
        const current: RecurringSeriesRecord = await this.require(id);
        this.assert(current, [SERIES_STATUSES.suggested], 'confirm');
        return this.patched(id, { ...editsPatch(edits), status: SERIES_STATUSES.confirmed, confirmedAt: now, snoozedUntil: null });
    }

    public async dismiss(id: string, now: Date): Promise<RecurringSeriesRecord> {
        const current: RecurringSeriesRecord = await this.require(id);
        this.assert(current, [SERIES_STATUSES.suggested, SERIES_STATUSES.confirmed], 'dismiss');
        await this.suppressions.insert(id, current.merchantKey, current.typicalAmountMinor);
        return this.patched(id, { status: SERIES_STATUSES.dismissed, dismissedAt: now, snoozedUntil: null });
    }

    public async restore(id: string): Promise<RecurringSeriesRecord> {
        const current: RecurringSeriesRecord = await this.require(id);
        this.assert(current, [SERIES_STATUSES.dismissed, SERIES_STATUSES.stopped], 'restore');
        if (current.status === SERIES_STATUSES.dismissed) {
            await this.suppressions.softDeleteBySeries(id);
            return this.patched(id, { status: SERIES_STATUSES.suggested, dismissedAt: null });
        }
        return this.patched(id, { status: SERIES_STATUSES.confirmed, stoppedAt: null, stoppedBy: null });
    }

    public async snooze(id: string, until: string): Promise<RecurringSeriesRecord> {
        const current: RecurringSeriesRecord = await this.require(id);
        this.assert(current, [SERIES_STATUSES.suggested], 'snooze');
        return this.patched(id, { snoozedUntil: until });
    }

    public async edit(id: string, edits: SeriesEdits): Promise<RecurringSeriesRecord> {
        const current: RecurringSeriesRecord = await this.require(id);
        this.assert(current, [SERIES_STATUSES.confirmed], 'edit');
        return this.patched(id, editsPatch(edits));
    }

    public async stop(id: string, by: StoppedBy, now: Date): Promise<RecurringSeriesRecord> {
        const current: RecurringSeriesRecord = await this.require(id);
        this.assert(current, [SERIES_STATUSES.confirmed], 'stop');
        return this.patched(id, { status: SERIES_STATUSES.stopped, stoppedAt: now, stoppedBy: by });
    }

    public async remove(id: string): Promise<void> {
        await this.series.softDelete(id);
        await this.charges.softDeleteMany((await this.charges.listBySeries(id)).map((row: ChargeRow): string => row.id));
    }

    public async excludeCharge(seriesId: string, transactionId: string): Promise<boolean> {
        const link: ChargeRow | null = await this.charges.findLink(seriesId, transactionId);
        if (link === null || link.role === CHARGE_ROLES.excluded) {
            return false;
        }
        await this.charges.setRole(link.id, CHARGE_ROLES.excluded);
        return true;
    }

    private async syncCharges(seriesId: string, desired: readonly DesiredCharge[]): Promise<void> {
        const existing: StoredCharge[] = (await this.charges.listBySeries(seriesId)).map(storedChargeOf);
        const diff: ReturnType<typeof diffCharges> = diffCharges(existing, desired);
        await this.charges.softDeleteMany(diff.removeIds);
        await this.charges.insertMany(seriesId, diff.insert);
    }

    private async patched(id: string, patch: SeriesPatch): Promise<RecurringSeriesRecord> {
        const row: SeriesRow | null = await this.series.patch(id, patch);
        if (row === null) {
            throw new SeriesNotFoundError(id);
        }
        return toRecord(row);
    }

    private assert(current: RecurringSeriesRecord, allowed: readonly SeriesStatus[], action: string): void {
        if (!allowed.includes(current.status)) {
            throw new InvalidSeriesStateError(current.id, current.status, action);
        }
    }
}
