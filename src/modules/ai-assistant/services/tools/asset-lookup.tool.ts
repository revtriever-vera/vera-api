import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../../shared/i18n/locale';
import { AssetLookupService, LookupEntry } from '../../../market-benchmarks/services/asset-lookup.service';
import { ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { outputOfBuilt, statusOutput } from '../../domain/ask-tool-output';
import { AssetLookupInput, assetLookupInputSchema } from '../../validation/ask-vera-tools.schemas';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';

@Injectable()
export class AssetLookupTool extends AskVeraToolPort {
    public readonly name: string = 'asset_lookup';
    public readonly feature: PaidFeature = 'ai';
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof assetLookupInputSchema = assetLookupInputSchema;

    public constructor(
        private readonly lookup: AssetLookupService,
        private readonly builder: AiContextBuilderService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Pesquisa um ativo ou fundo no catálogo pelo nome ou código e devolve até 3: nome, código, tipo, classe, mercado e a última cotação com a data. Fundos trazem o fund_id para fund_performance. Só explica o que o ativo é: não julga se é bom, caro ou barato. Não usa dados da conta.'
            : 'Looks an asset or fund up in the catalog by name or code and returns up to 3: name, code, type, class, market and the latest quote with its date. Funds carry the fund_id for fund_performance. It only says what the asset is: it does not judge whether it is good, expensive or cheap. Uses no account data.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: AssetLookupInput = assetLookupInputSchema.parse(input);
        const entries: LookupEntry[] = await this.lookup.lookup(parsed.query);
        return entries.length === 0 ? statusOutput('no_match') : outputOfBuilt(this.builder.assetLookup(entries));
    }
}
