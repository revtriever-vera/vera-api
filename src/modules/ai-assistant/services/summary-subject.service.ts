import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { AppLocale } from '../../../shared/i18n/locale';
import { ContributionPlannerService, ContributionSuggestion } from '../../contribution/services/contribution-planner.service';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { CutsResult, SpendingCutsService } from '../../spending-cuts/services/spending-cuts.service';
import { MonthlySummary, SpendingSummaryService } from '../../spending-summary/services/spending-summary.service';
import { AiContext, BuiltContext } from '../domain/context/ai-context.types';
import { AI_SPENDING_CURRENCY } from '../domain/context/month.context';
import { goalMetText } from '../domain/summary-fixed-texts';
import { SUMMARY_TASKS, SummaryKind, SummarySubject } from '../domain/summary.types';
import { SummaryQuery } from '../validation/summaries.schemas';
import { AiContextBuilderService } from './ai-context-builder.service';

const GOAL_MET: string = 'goal_met';

@Injectable()
export class SummarySubjectService {
    public constructor(
        private readonly summaries: SpendingSummaryService,
        private readonly cuts: SpendingCutsService,
        private readonly snapshots: PortfolioSnapshotService,
        private readonly planner: ContributionPlannerService,
        private readonly builder: AiContextBuilderService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext
    ) {}

    public async of(kind: SummaryKind, input: SummaryQuery): Promise<SummarySubject | null> {
        if (kind === 'portfolio') {
            return this.portfolio(input.contributionMinor);
        }
        const summary: MonthlySummary = await this.summaries.build(input.month ?? null);
        if (!summary.hasData) {
            return null;
        }
        return kind === 'month' ? this.model(kind, summary.month, this.builder.month(summary)) : this.cutsOf(summary, input.goalBps);
    }

    private cutsOf(summary: MonthlySummary, goalBps: number | undefined): SummarySubject | null {
        const result: CutsResult = this.cuts.compute(summary, goalBps);
        const periodKey: string = `${result.month}:${String(result.goal.bps)}`;
        if (result.status === GOAL_MET) {
            return { mode: 'fixed', fixed: { periodKey, paragraphs: this.goalMet(result) } };
        }
        const built: BuiltContext<AiContext> | null = this.builder.cuts(result);
        return built === null ? null : this.model('cuts', periodKey, built);
    }

    private async portfolio(contributionMinor: number | undefined): Promise<SummarySubject | null> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build(ANY_HOLDER);
        if (snapshot.empty) {
            return null;
        }
        const planned: ContributionSuggestion | null =
            contributionMinor === undefined ? null : this.planner.planOrNull(snapshot, contributionMinor);
        return this.model('portfolio', await this.timezones.todayInCompany(), this.builder.portfolio(snapshot, planned));
    }

    private model(kind: SummaryKind, periodKey: string, built: BuiltContext<AiContext>): SummarySubject {
        return { mode: 'model', context: { periodKey, built, contextHash: this.builder.hash(built.payload, SUMMARY_TASKS[kind]) } };
    }

    private goalMet(result: CutsResult): readonly string[] {
        const locale: AppLocale = this.context.get().locale;
        return goalMetText({ goalBps: result.goal.bps, surplusMinor: result.surplusMinor, currency: AI_SPENDING_CURRENCY }, locale);
    }
}
