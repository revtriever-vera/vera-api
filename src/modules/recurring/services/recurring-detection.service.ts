import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { SERIES_ORIGINS, SERIES_STATUSES, SeriesFields, StoredSeries, STOPPED_BY } from '../domain/recurring-series.types';
import { clampName, titleCase } from '../domain/series-lifecycle';
import { detectedFieldsOf, desiredChargesOf, planSync, SeriesAction } from '../domain/series-sync';
import { detectRecurring } from '../domain/recurring-detector';
import { DetectedSeries, DetectorTransaction } from '../domain/recurring.types';
import { DetectionCounts, RecurringLogService } from './recurring-log.service';
import { RecurringDetectionInputService } from './recurring-detection-input.service';

const EMPTY: DetectionCounts = { detected: 0, created: 0, refreshed: 0, removed: 0, stopped: 0 };

function latestChargeOf(series: DetectedSeries): string {
    return series.chargeIds.at(-1) ?? '';
}

function bump(counts: DetectionCounts, field: keyof DetectionCounts): DetectionCounts {
    return { ...counts, [field]: counts[field] + 1 };
}

@Injectable()
export class RecurringDetectionService {
    public constructor(
        private readonly domain: RecurringSeriesDomain,
        private readonly input: RecurringDetectionInputService,
        private readonly timezones: CompanyTimezoneService,
        private readonly logs: RecurringLogService
    ) {}

    public async run(now: Date = new Date()): Promise<DetectionCounts> {
        const startedAt: number = Date.now();
        const today: string = await this.timezones.todayInCompany(now);
        const excluded: Set<string> = new Set<string>(await this.domain.excludedTransactionIds());
        const transactions: DetectorTransaction[] = await this.input.load(today, excluded);
        const detected: readonly DetectedSeries[] = detectRecurring(transactions);
        const labels: Map<string, string> = await this.input.labelsOf(detected.map(latestChargeOf));
        const counts: DetectionCounts = await this.apply(detected, labels, today, now);
        this.logs.detected(counts, Date.now() - startedAt);
        return counts;
    }

    @UsingTransaction()
    private async apply(
        detected: readonly DetectedSeries[],
        labels: ReadonlyMap<string, string>,
        today: string,
        now: Date
    ): Promise<DetectionCounts> {
        await this.domain.lockWrites();
        const stored: StoredSeries[] = await this.domain.stored();
        const byId: Map<string, StoredSeries> = new Map<string, StoredSeries>(
            stored.map((series: StoredSeries): [string, StoredSeries] => [series.id, series])
        );
        const actions: SeriesAction[] = planSync(detected, stored, await this.domain.storedSuppressions(), today);
        let counts: DetectionCounts = { ...EMPTY, detected: detected.length };
        for (const action of actions) {
            counts = bump(counts, await this.execute(action, byId, labels, now));
        }
        return counts;
    }

    private async execute(
        action: SeriesAction,
        byId: ReadonlyMap<string, StoredSeries>,
        labels: ReadonlyMap<string, string>,
        now: Date
    ): Promise<keyof DetectionCounts> {
        if (action.kind === 'create') {
            await this.domain.create(this.newSeries(action.detected, labels), desiredChargesOf(action.detected));
            return 'created';
        }
        if (action.kind === 'refresh') {
            await this.refresh(action.id, action.detected, byId.get(action.id)?.status ?? SERIES_STATUSES.suggested, action.reactivate);
            return 'refreshed';
        }
        if (action.kind === 'remove') {
            await this.domain.remove(action.id);
            return 'removed';
        }
        await this.domain.stop(action.id, STOPPED_BY.auto, now);
        return 'stopped';
    }

    private async refresh(id: string, detected: DetectedSeries, status: string, reactivate: boolean): Promise<void> {
        const fields: ReturnType<typeof detectedFieldsOf> = detectedFieldsOf(detected);
        if (status === SERIES_STATUSES.suggested) {
            await this.domain.refreshSuggested(id, fields, desiredChargesOf(detected));
            return;
        }
        await this.domain.refreshReviewed(id, fields, desiredChargesOf(detected), reactivate);
    }

    private newSeries(detected: DetectedSeries, labels: ReadonlyMap<string, string>): SeriesFields {
        const fields: ReturnType<typeof detectedFieldsOf> = detectedFieldsOf(detected);
        return {
            ...fields,
            name: clampName(labels.get(latestChargeOf(detected)) ?? titleCase(detected.merchantKey)),
            merchantKey: detected.merchantKey,
            status: SERIES_STATUSES.suggested,
            origin: SERIES_ORIGINS.detected,
            confirmedAt: null
        };
    }
}
