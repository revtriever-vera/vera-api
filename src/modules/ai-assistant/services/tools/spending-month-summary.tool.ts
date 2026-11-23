import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../../shared/i18n/locale';
import { MonthlySummary, SpendingSummaryService } from '../../../spending-summary/services/spending-summary.service';
import { ASK_VERA_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt, statusOutput } from '../../domain/ask-tool-output';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';
import { monthSummaryInputSchema, MonthSummaryInput } from '../../validation/ask-vera-tools.schemas';

@Injectable()
export class SpendingMonthSummaryTool extends AskVeraToolPort {
    public readonly name: string = 'spending_month_summary';
    public readonly feature: PaidFeature = ASK_VERA_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof monthSummaryInputSchema = monthSummaryInputSchema;

    public constructor(
        private readonly summaries: SpendingSummaryService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Resumo dos gastos de um mês: renda, gastos, guardado, fixos, flexíveis e total por categoria, com a média dos 3 meses anteriores.'
            : 'Spending summary of a month: income, spending, saved, fixed, flexible and total per category, with the average of the previous 3 months.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: MonthSummaryInput = monthSummaryInputSchema.parse(input);
        const summary: MonthlySummary = await this.summaries.build(parsed.month ?? null);
        return summary.hasData ? outputOfBuilt(this.builder.month(summary)) : statusOutput('no_data');
    }
}
