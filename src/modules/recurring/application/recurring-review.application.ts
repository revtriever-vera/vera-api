import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { RecurrenceTransaction, TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { buildManualSeries, ManualSeries } from '../domain/manual-series';
import { addDaysTo } from '../domain/recurring-dates';
import { detectRecurring } from '../domain/recurring-detector';
import { ChargeNotInSeriesError, RecurrenceNotEligibleError, RecurrenceTransactionNotFoundError } from '../domain/recurring.errors';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import {
    RecurringSeriesRecord,
    SERIES_ORIGINS,
    SERIES_STATUSES,
    SNOOZE_DAYS,
    SeriesFields,
    STOPPED_BY,
    StoredSeries
} from '../domain/recurring-series.types';
import { clampName, titleCase } from '../domain/series-lifecycle';
import { desiredChargesOf, detectedFieldsOf, matchStored } from '../domain/series-sync';
import { DetectedSeries, DetectorTransaction } from '../domain/recurring.types';
import { RecurringCategoryService } from '../services/recurring-category.service';
import { RecurringDetectionInputService } from '../services/recurring-detection-input.service';
import { RecurringDetectionService } from '../services/recurring-detection.service';
import { RecurringLogService } from '../services/recurring-log.service';
import { toSeriesView } from '../services/recurring-view.mapper';
import { ConfirmedSeriesView, SeriesView } from '../validation/recurring.schemas';

const BASE_CURRENCY: string = 'BRL';

export interface ConfirmInput {
    readonly name: string;
    readonly cadence: RecurringSeriesRecord['cadence'];
    readonly expectedDay: number | null;
    readonly kind: RecurringSeriesRecord['kind'];
    readonly categoryId?: string;
    readonly createRule?: boolean;
}

export interface UpdateInput {
    readonly name?: string;
    readonly cadence?: RecurringSeriesRecord['cadence'];
    readonly expectedDay?: number | null;
    readonly valueMode?: RecurringSeriesRecord['valueMode'];
    readonly kind?: RecurringSeriesRecord['kind'];
}

interface Candidate {
    readonly target: DetectorTransaction;
    readonly containing: DetectedSeries | null;
    readonly manual: ManualSeries;
    readonly name: string;
}

function holdsCharge(series: DetectedSeries, transactionId: string): boolean {
    return series.chargeIds.includes(transactionId);
}

function confirmationOf(record: RecurringSeriesRecord): Pick<ConfirmInput, 'name' | 'cadence' | 'expectedDay' | 'kind'> {
    return { name: record.name, cadence: record.cadence, expectedDay: record.expectedDay, kind: record.kind };
}

@Injectable()
export class RecurringReviewApplication {
    public constructor(
        private readonly domain: RecurringSeriesDomain,
        private readonly categoryRules: RecurringCategoryService,
        private readonly detection: RecurringDetectionService,
        private readonly input: RecurringDetectionInputService,
        private readonly reader: TransactionReaderService,
        private readonly timezones: CompanyTimezoneService,
        private readonly logs: RecurringLogService
    ) {}

    @UsingTransaction()
    public async confirm(id: string, body: ConfirmInput): Promise<ConfirmedSeriesView> {
        await this.domain.lockWrites();
        const record: RecurringSeriesRecord = await this.domain.confirm(
            id,
            { name: clampName(body.name), cadence: body.cadence, expectedDay: body.expectedDay, kind: body.kind },
            new Date()
        );
        const rule: Awaited<ReturnType<RecurringCategoryService['alwaysTo']>> =
            body.createRule === true && body.categoryId !== undefined
                ? await this.categoryRules.alwaysTo(record, await this.domain.chargeTransactionIds(id), body.categoryId)
                : { created: false, recategorized: 0 };
        this.logs.written('confirm', id);
        return { series: toSeriesView(record), categoryRule: rule };
    }

    @UsingTransaction()
    public async dismiss(id: string): Promise<SeriesView> {
        await this.domain.lockWrites();
        const record: RecurringSeriesRecord = await this.domain.dismiss(id, new Date());
        this.logs.written('dismiss', id);
        return toSeriesView(record);
    }

    @UsingTransaction()
    public async restore(id: string): Promise<SeriesView> {
        await this.domain.lockWrites();
        const record: RecurringSeriesRecord = await this.domain.restore(id);
        this.logs.written('restore', id);
        return toSeriesView(record);
    }

    @UsingTransaction()
    public async snooze(id: string): Promise<SeriesView> {
        await this.domain.lockWrites();
        const until: string = addDaysTo(await this.timezones.todayInCompany(), SNOOZE_DAYS);
        const record: RecurringSeriesRecord = await this.domain.snooze(id, until);
        this.logs.written('snooze', id);
        return toSeriesView(record);
    }

    @UsingTransaction()
    public async update(id: string, body: UpdateInput): Promise<SeriesView> {
        await this.domain.lockWrites();
        const record: RecurringSeriesRecord = await this.domain.edit(id, {
            ...body,
            ...(body.name === undefined ? {} : { name: clampName(body.name) })
        });
        this.logs.written('edit', id);
        return toSeriesView(record);
    }

    @UsingTransaction()
    public async stop(id: string): Promise<SeriesView> {
        await this.domain.lockWrites();
        const record: RecurringSeriesRecord = await this.domain.stop(id, STOPPED_BY.user, new Date());
        this.logs.written('stop', id);
        return toSeriesView(record);
    }

    public async removeCharge(id: string, transactionId: string): Promise<void> {
        await this.exclude(id, transactionId);
        await this.detection.run();
    }

    public async createFromTransaction(transactionId: string, name: string | undefined): Promise<SeriesView> {
        const candidate: Candidate = await this.candidateOf(transactionId, name);
        return this.persist(candidate);
    }

    @UsingTransaction()
    private async exclude(id: string, transactionId: string): Promise<void> {
        await this.domain.lockWrites();
        await this.domain.require(id);
        if (!(await this.domain.excludeCharge(id, transactionId))) {
            throw new ChargeNotInSeriesError(id, transactionId);
        }
        this.logs.written('exclude_charge', id);
    }

    private async candidateOf(transactionId: string, name: string | undefined): Promise<Candidate> {
        const row: RecurrenceTransaction | undefined = (await this.reader.findForRecurrence([transactionId]))[0];
        if (row === undefined) {
            throw new RecurrenceTransactionNotFoundError(transactionId);
        }
        if (row.amountMinor >= 0 || row.currency !== BASE_CURRENCY) {
            throw new RecurrenceNotEligibleError(transactionId);
        }
        const today: string = await this.timezones.todayInCompany();
        const pool: DetectorTransaction[] = await this.input.load(today, new Set<string>(await this.domain.excludedTransactionIds()));
        const target: DetectorTransaction =
            pool.find((item: DetectorTransaction): boolean => item.id === row.id) ?? (await this.input.toDetectorRow(row));
        return {
            target,
            containing: detectRecurring(pool).find((series: DetectedSeries): boolean => holdsCharge(series, row.id)) ?? null,
            manual: buildManualSeries(target, pool, new Date()),
            name: clampName(name ?? this.input.labelOf(row))
        };
    }

    @UsingTransaction()
    private async persist(candidate: Candidate): Promise<SeriesView> {
        await this.domain.lockWrites();
        const linked: string | undefined = (await this.domain.seriesOfTransaction(candidate.target.id))[0];
        const stored: StoredSeries[] = await this.domain.stored();
        const matched: StoredSeries | null = candidate.containing === null ? null : matchStored(candidate.containing, stored);
        const existingId: string | undefined = linked ?? matched?.id;
        const record: RecurringSeriesRecord = existingId === undefined ? await this.create(candidate) : await this.promote(existingId);
        this.logs.written('create_from_transaction', record.id);
        return toSeriesView(record);
    }

    private async create(candidate: Candidate): Promise<RecurringSeriesRecord> {
        const now: Date = new Date();
        if (candidate.containing === null) {
            return this.domain.create({ ...candidate.manual.fields, name: candidate.name }, candidate.manual.charges);
        }
        const fields: SeriesFields = {
            ...detectedFieldsOf(candidate.containing),
            name: candidate.name || titleCase(candidate.containing.merchantKey),
            merchantKey: candidate.containing.merchantKey,
            status: SERIES_STATUSES.confirmed,
            origin: SERIES_ORIGINS.detected,
            confirmedAt: now
        };
        return this.domain.create(fields, desiredChargesOf(candidate.containing));
    }

    private async promote(id: string): Promise<RecurringSeriesRecord> {
        const current: RecurringSeriesRecord = await this.domain.require(id);
        if (current.status === SERIES_STATUSES.confirmed) {
            return current;
        }
        if (current.status === SERIES_STATUSES.stopped) {
            return this.domain.restore(id);
        }
        const suggested: RecurringSeriesRecord = current.status === SERIES_STATUSES.dismissed ? await this.domain.restore(id) : current;
        return this.domain.confirm(id, confirmationOf(suggested), new Date());
    }
}
