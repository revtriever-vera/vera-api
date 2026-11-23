import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../../shared/holder/holder-filter';
import { AppLocale } from '../../../../shared/i18n/locale';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../../portfolio/services/portfolio-snapshot.service';
import { ASK_VERA_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt, statusOutput } from '../../domain/ask-tool-output';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';
import { noInputSchema } from '../../validation/ask-vera-tools.schemas';

@Injectable()
export class PortfolioOverviewTool extends AskVeraToolPort {
    public readonly name: string = 'portfolio_overview';
    public readonly feature: PaidFeature = ASK_VERA_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof noInputSchema = noInputSchema;

    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Visão da carteira: total, exposição em dólar e, por classe de ativo, o percentual atual, a meta e a situação.'
            : 'Portfolio overview: total, dollar exposure and, per asset class, the current share, the target and the status.';
    }

    public async run(): Promise<AskVeraToolOutput> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build(ANY_HOLDER);
        return snapshot.empty ? statusOutput('no_portfolio') : outputOfBuilt(this.builder.portfolio(snapshot, null));
    }
}
