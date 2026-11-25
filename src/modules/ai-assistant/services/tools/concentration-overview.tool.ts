import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../../shared/i18n/locale';
import { ConcentrationReaderService, ConcentrationReading } from '../../../concentration/services/concentration-reader.service';
import { ASK_VERA_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt, statusOutput } from '../../domain/ask-tool-output';
import { noInputSchema } from '../../validation/ask-vera-tools.schemas';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';

@Injectable()
export class ConcentrationOverviewTool extends AskVeraToolPort {
    public readonly name: string = 'concentration_overview';
    public readonly feature: PaidFeature = ASK_VERA_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof noInputSchema = noInputSchema;

    public constructor(
        private readonly reader: ConcentrationReaderService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Concentração da carteira: valor e percentual por emissor (os maiores) e por setor das ações, sem nome de ativo.'
            : 'Portfolio concentration: value and share per issuer (the largest ones) and per sector of the equities, with no asset names.';
    }

    public async run(): Promise<AskVeraToolOutput> {
        const reading: ConcentrationReading = await this.reader.read();
        return reading.response.totalMinor === 0
            ? statusOutput('no_portfolio')
            : outputOfBuilt(this.builder.concentration(reading.response));
    }
}
