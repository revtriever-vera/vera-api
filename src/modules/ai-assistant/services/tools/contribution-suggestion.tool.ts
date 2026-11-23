import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../../shared/holder/holder-filter';
import { AppLocale } from '../../../../shared/i18n/locale';
import { ContributionPlannerService, ContributionSuggestion } from '../../../contribution/services/contribution-planner.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../../portfolio/services/portfolio-snapshot.service';
import { ASK_VERA_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt, statusOutput } from '../../domain/ask-tool-output';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';
import { contributionInputSchema, ContributionInput } from '../../validation/ask-vera-tools.schemas';

@Injectable()
export class ContributionSuggestionTool extends AskVeraToolPort {
    public readonly name: string = 'contribution_suggestion';
    public readonly feature: PaidFeature = ASK_VERA_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof contributionInputSchema = contributionInputSchema;

    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly planner: ContributionPlannerService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Divisão de um aporte entre as classes de ativo para aproximar a carteira da meta (Onde aportar).'
            : 'How a contribution splits across asset classes to bring the portfolio closer to the target (Where to contribute).';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: ContributionInput = contributionInputSchema.parse(input);
        const snapshot: PortfolioSnapshot = await this.snapshots.build(ANY_HOLDER);
        if (snapshot.empty) {
            return statusOutput('no_portfolio');
        }
        const planned: ContributionSuggestion | null = this.planner.planOrNull(snapshot, parsed.amountMinor);
        return planned === null ? statusOutput('no_targets') : outputOfBuilt(this.builder.portfolio(snapshot, planned));
    }
}
