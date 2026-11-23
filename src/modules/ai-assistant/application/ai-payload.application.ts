import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { ContributionPlannerService, ContributionSuggestion } from '../../contribution/services/contribution-planner.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { SpendingCutsService } from '../../spending-cuts/services/spending-cuts.service';
import { MonthlySummary, SpendingSummaryService } from '../../spending-summary/services/spending-summary.service';
import { AiPayloadKind } from '../domain/ai-assistant.types';
import { AI_NOTICE_VERSION } from '../domain/ai-notice';
import { AiContext, BuiltContext } from '../domain/context/ai-context.types';
import { serializeContext } from '../domain/context/context-hash';
import { AiAssistantLogService } from '../services/ai-assistant-log.service';
import { AiAssistantMetricsService } from '../services/ai-assistant-metrics.service';
import { AiContextBuilderService } from '../services/ai-context-builder.service';
import { PayloadQuery } from '../validation/ai-payload.schemas';

export interface AiPayloadView {
    readonly kind: AiPayloadKind;
    readonly noticeVersion: number;
    readonly payload: AiContext;
}

@Injectable()
export class AiPayloadApplication {
    public constructor(
        private readonly summaries: SpendingSummaryService,
        private readonly cuts: SpendingCutsService,
        private readonly snapshots: PortfolioSnapshotService,
        private readonly planner: ContributionPlannerService,
        private readonly builder: AiContextBuilderService,
        private readonly logs: AiAssistantLogService,
        private readonly metrics: AiAssistantMetricsService
    ) {}

    public async build(query: PayloadQuery): Promise<AiPayloadView | null> {
        const built: BuiltContext<AiContext> | null = await this.builtFor(query);
        if (built === null) {
            return null;
        }
        const bytes: number = Buffer.byteLength(serializeContext(built.payload));
        this.logs.payloadBuilt(query.kind, bytes);
        this.metrics.contextBytes(query.kind, bytes);
        return { kind: query.kind, noticeVersion: AI_NOTICE_VERSION, payload: built.payload };
    }

    private async builtFor(query: PayloadQuery): Promise<BuiltContext<AiContext> | null> {
        if (query.kind === 'portfolio') {
            return this.portfolio(query.contributionMinor);
        }
        const summary: MonthlySummary = await this.summaries.build(query.month ?? null);
        if (!summary.hasData) {
            return null;
        }
        return query.kind === 'month' ? this.builder.month(summary) : this.builder.cuts(this.cuts.compute(summary, query.goalBps));
    }

    private async portfolio(contributionMinor: number | undefined): Promise<BuiltContext<AiContext> | null> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build(ANY_HOLDER);
        if (snapshot.empty) {
            return null;
        }
        const planned: ContributionSuggestion | null =
            contributionMinor === undefined ? null : this.planner.planOrNull(snapshot, contributionMinor);
        return this.builder.portfolio(snapshot, planned);
    }
}
