import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../../shared/i18n/locale';
import { DateUtil } from '../../../../shared/utils/date.util';
import { BenchmarkService, BenchmarkWindows } from '../../../market-benchmarks/services/benchmark.service';
import { ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt } from '../../domain/ask-tool-output';
import { BenchmarksInput, benchmarksInputSchema } from '../../validation/ask-vera-tools.schemas';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';

@Injectable()
export class MarketBenchmarksTool extends AskVeraToolPort {
    public readonly name: string = 'market_benchmarks';
    public readonly feature: PaidFeature = 'ai';
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof benchmarksInputSchema = benchmarksInputSchema;

    public constructor(
        private readonly benchmarks: BenchmarkService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Indicadores de referência do mercado já acumulados: CDI e IPCA em 1, 3, 6, 12, 24 e 36 meses e no ano, Selic meta atual e Ibovespa nos mesmos períodos, cada um com a data até onde vai e a fonte. Use para comparar com a pessoa o que rendeu o CDI, a inflação ou a bolsa; não calcule acumulado nem diferença. Não usa dados da conta.'
            : 'Ready-made market reference figures, already accumulated: CDI and IPCA over 1, 3, 6, 12, 24 and 36 months and the year so far, the current Selic target and the Ibovespa over the same periods, each with the date it runs to and its source. Use it to say what the CDI, inflation or the stock index returned; do not compute accumulations or differences. Uses no account data.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: BenchmarksInput = benchmarksInputSchema.parse(input);
        const asOf: string = DateUtil.todayInBrazil();
        const windows: BenchmarkWindows = await this.benchmarks.windows({ asOf });
        return outputOfBuilt(this.builder.benchmarks(windows, parsed.windows));
    }
}
