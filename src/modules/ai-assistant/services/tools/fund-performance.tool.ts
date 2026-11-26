import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../../shared/i18n/locale';
import { DateUtil } from '../../../../shared/utils/date.util';
import {
    FUND_WINDOWS,
    FundPerformance,
    FundPerformanceService,
    FundWindow
} from '../../../market-benchmarks/services/fund-performance.service';
import { ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt } from '../../domain/ask-tool-output';
import { FundPerformanceInput, fundPerformanceInputSchema } from '../../validation/ask-vera-tools.schemas';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';

@Injectable()
export class FundPerformanceTool extends AskVeraToolPort {
    public readonly name: string = 'fund_performance';
    public readonly feature: PaidFeature = 'ai';
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof fundPerformanceInputSchema = fundPerformanceInputSchema;

    public constructor(
        private readonly funds: FundPerformanceService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Rentabilidade passada da cota de um fundo em 1, 3, 6, 12 e 36 meses e o CDI no mesmo período, com a diferença em pontos já calculada, a data até onde vai e a fonte (CVM). Passe o fund_id devolvido por asset_lookup. Janela sem histórico vem em sem_historico: diga que não há dado, sem estimar. Rentabilidade passada não é promessa de resultado futuro. Não usa dados da conta.'
            : 'Past return of a fund quota over 1, 3, 6, 12 and 36 months and the CDI over the same period, with the difference in points already computed, the date it runs to and the source (CVM). Pass the fund_id returned by asset_lookup. A window without history comes in sem_historico: say there is no data, without estimating. Past returns do not promise future results. Uses no account data.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: FundPerformanceInput = fundPerformanceInputSchema.parse(input);
        const shown: readonly FundWindow[] = parsed.windows ?? FUND_WINDOWS;
        const performance: FundPerformance = await this.funds.performance({
            fundKey: parsed.fundId,
            windows: shown,
            asOf: DateUtil.todayInBrazil()
        });
        return outputOfBuilt(this.builder.fundPerformance(performance, shown));
    }
}
