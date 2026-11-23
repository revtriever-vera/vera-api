import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../../shared/i18n/locale';
import { CutsResult, SpendingCutsService } from '../../../spending-cuts/services/spending-cuts.service';
import { MonthlySummary, SpendingSummaryService } from '../../../spending-summary/services/spending-summary.service';
import { AiCutsContext, BuiltContext } from '../../domain/context/ai-context.types';
import { ASK_VERA_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt, statusOutput } from '../../domain/ask-tool-output';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';
import { cutsInputSchema, CutsInput } from '../../validation/ask-vera-tools.schemas';

@Injectable()
export class SpendingCutsTool extends AskVeraToolPort {
    public readonly name: string = 'spending_cuts';
    public readonly feature: PaidFeature = ASK_VERA_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof cutsInputSchema = cutsInputSchema;

    public constructor(
        private readonly summaries: SpendingSummaryService,
        private readonly cuts: SpendingCutsService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Cortes sugeridos nos gastos flexíveis para bater a meta de economia, com o limite sugerido por categoria.'
            : 'Suggested cuts in flexible spending to reach the savings goal, with a suggested limit per category.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: CutsInput = cutsInputSchema.parse(input);
        const summary: MonthlySummary = await this.summaries.build(parsed.month ?? null);
        if (!summary.hasData) {
            return statusOutput('no_data');
        }
        const result: CutsResult = this.cuts.compute(summary, parsed.goalBps);
        const built: BuiltContext<AiCutsContext> | null = this.builder.cuts(result);
        return built === null ? statusOutput(result.status) : outputOfBuilt(built);
    }
}
