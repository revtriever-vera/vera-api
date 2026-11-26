import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../../shared/i18n/locale';
import { DateUtil } from '../../../../shared/utils/date.util';
import { FixedIncomeBenchmarkService, FixedIncomeComparison } from '../../../market-benchmarks/services/fixed-income-benchmark.service';
import { ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt } from '../../domain/ask-tool-output';
import { FixedIncomeBenchmarkInput, fixedIncomeBenchmarkInputSchema } from '../../validation/ask-vera-tools.schemas';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';

@Injectable()
export class FixedIncomeVsBenchmarkTool extends AskVeraToolPort {
    public readonly name: string = 'fixed_income_vs_benchmark';
    public readonly feature: PaidFeature = 'ai';
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof fixedIncomeBenchmarkInputSchema = fixedIncomeBenchmarkInputSchema;

    public constructor(
        private readonly comparison: FixedIncomeBenchmarkService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Compara um título de renda fixa da carteira com o CDI e o IPCA de 12 meses: taxa contratada, taxa nominal e real estimadas, se ganha da inflação e a diferença para o CDI em pontos, tudo já calculado. Sem holdingKey, lista os títulos da carteira com a chave de cada um (sem nome de emissor); com a chave, devolve a comparação desse título. Usa dados da carteira da pessoa.'
            : "Compares one fixed income security of the portfolio with the 12-month CDI and IPCA: contracted rate, estimated nominal and real rates, whether it beats inflation and the difference to the CDI in points, all already computed. Without holdingKey it lists the portfolio's securities with their keys (no issuer name); with the key it returns that security's comparison. Uses the person's portfolio data.";
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: FixedIncomeBenchmarkInput = fixedIncomeBenchmarkInputSchema.parse(input);
        const result: FixedIncomeComparison = await this.comparison.compare({
            holdingKey: parsed.holdingKey,
            asOf: DateUtil.todayInBrazil()
        });
        return outputOfBuilt(this.builder.fixedIncomeBenchmark(result));
    }
}
