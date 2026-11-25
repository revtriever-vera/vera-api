import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../../shared/i18n/locale';
import {
    MaturitiesReaderService,
    MaturitiesReading,
    MaturityItem
} from '../../../fixed-income-schedule/services/maturities-reader.service';
import { ASK_VERA_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { monthIndexOf, monthOfIndex, outputOfBuilt, statusOutput } from '../../domain/ask-tool-output';
import { DEFAULT_MATURITY_MONTHS, MaturitiesInput, maturitiesInputSchema } from '../../validation/ask-vera-tools.schemas';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';

const MONTH_CHARS: number = 7;

@Injectable()
export class FixedIncomeMaturitiesTool extends AskVeraToolPort {
    public readonly name: string = 'fixed_income_maturities';
    public readonly feature: PaidFeature = ASK_VERA_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof maturitiesInputSchema = maturitiesInputSchema;

    public constructor(
        private readonly reader: MaturitiesReaderService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Vencimentos da renda fixa nos próximos meses (padrão 12): valor estimado e mês de cada vencimento, por tipo de título, sem nome de título.'
            : 'Fixed income maturities in the coming months (default 12): estimated value and month of each maturity, per kind of security, with no security names.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: MaturitiesInput = maturitiesInputSchema.parse(input);
        const reading: MaturitiesReading = await this.reader.readAll();
        const untilMonth: string = monthOfIndex(
            monthIndexOf(reading.asOf.slice(0, MONTH_CHARS)) + (parsed.months ?? DEFAULT_MATURITY_MONTHS)
        );
        const items: MaturityItem[] = reading.items.filter(
            (item: MaturityItem): boolean => item.maturityDate.slice(0, MONTH_CHARS) <= untilMonth
        );
        return items.length === 0 ? statusOutput('no_maturities') : outputOfBuilt(this.builder.maturities(items, untilMonth));
    }
}
