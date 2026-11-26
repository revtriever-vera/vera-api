import { Injectable } from '@nestjs/common';
import { AppContext } from '../../context/app-context.port';
import { QueuePublisherPort } from '../../queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { PaidUsageEntryDomain } from '../domain/paid-usage-entry.domain';
import { PaidUsageNoticeDomain } from '../domain/paid-usage-notice.domain';
import { UsageContextHolder } from '../ports/usage-context.holder';
import { parseUsageDetail } from '../usage-detail.schema';
import { CapReachedError } from '../usage.errors';
import { periodOf } from '../usage-period';
import {
    AssertRoomInput,
    NOTICE_KINDS,
    NoticeKind,
    RecordUsageInput,
    UsageDetail,
    UsageFeature,
    UsageState,
    USAGE_STATES,
    UsageThresholdPayload
} from '../usage.types';
import { UsageLogService } from './usage-log.service';
import { UsageMetricsService } from './usage-metrics.service';
import { UsageSnapshotService } from './usage-snapshot.service';

interface Budget {
    readonly capMicros: number | null;
    readonly usedMicros: number;
}

function budgetOf(state: UsageState, feature: UsageFeature): Budget {
    if (feature === 'help' && state.help.separate) {
        return { capMicros: state.help.capMicros, usedMicros: state.help.usedMicros };
    }
    return { capMicros: state.capMicros, usedMicros: state.usedMicros };
}

@Injectable()
export class PaidUsageMeter {
    public constructor(
        private readonly entries: PaidUsageEntryDomain,
        private readonly notices: PaidUsageNoticeDomain,
        private readonly snapshots: UsageSnapshotService,
        private readonly holder: UsageContextHolder,
        private readonly publisher: QueuePublisherPort,
        private readonly context: AppContext,
        private readonly logs: UsageLogService,
        private readonly metrics: UsageMetricsService
    ) {}

    public async state(): Promise<UsageState> {
        return this.snapshots.state();
    }

    public async assertRoom(input: AssertRoomInput): Promise<void> {
        const state: UsageState = await this.snapshots.state();
        const budget: Budget = budgetOf(state, input.feature);
        if (budget.capMicros === null) {
            return;
        }
        const remaining: number = budget.capMicros - budget.usedMicros;
        if (remaining > 0 && input.estimateMicros <= remaining) {
            return;
        }
        this.logs.capReached(input.feature, input.task, state.period);
        this.metrics.capReached(input.feature);
        throw new CapReachedError(input.feature, state.resetsAt);
    }

    public async record(input: RecordUsageInput): Promise<void> {
        const detail: UsageDetail | null = parseUsageDetail(input.detail);
        const costMicros: number = input.outcome === 'unanswered' ? 0 : input.costMicros;
        const now: Date = new Date();
        const period: string = periodOf(now, await this.holder.timezone());
        const inserted: boolean = await this.entries.insertIfAbsent({ input, period, costMicros, detail, occurredAt: now });
        if (!inserted) {
            return;
        }
        this.snapshots.invalidate();
        this.metrics.cost(input.feature, input.task, costMicros);
        await this.afterRecord(input, costMicros);
    }

    private async afterRecord(input: RecordUsageInput, costMicros: number): Promise<void> {
        if (input.estimateMicros !== undefined && costMicros > input.estimateMicros) {
            this.logs.recordedAboveEstimate(input.task, input.estimateMicros, costMicros);
        }
        const state: UsageState = await this.snapshots.state();
        if (state.capMicros !== null && state.usedMicros > state.capMicros) {
            this.metrics.overshoot(Math.min(costMicros, state.usedMicros - state.capMicros));
        }
        await this.announceCrossing(state);
    }

    private async announceCrossing(state: UsageState): Promise<void> {
        if (state.state === USAGE_STATES.ok) {
            return;
        }
        const kind: NoticeKind = state.state === USAGE_STATES.paused ? NOTICE_KINDS.paused : NOTICE_KINDS.warning;
        if (!(await this.notices.claim(state.period, kind))) {
            return;
        }
        this.logs.thresholdCrossed(kind, state.period);
        const payload: UsageThresholdPayload = { period: state.period, kind, usedBps: state.usedBps };
        await this.publisher.publish(QUEUES.usage, MESSAGE_TYPES.usageThresholdCrossed, payload, {
            jobId: `usage-notice-${this.companyId()}-${state.period}-${kind}`
        });
    }

    private companyId(): string {
        return this.context.get().companyId ?? '';
    }
}
