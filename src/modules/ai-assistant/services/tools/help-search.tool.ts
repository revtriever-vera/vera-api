import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../../core/context/app-context.port';
import { AppLocale } from '../../../../shared/i18n/locale';
import { ASK_VERA_HELP_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { HELP_CATALOG } from '../../domain/help/help-catalog';
import { helpSearchPayload } from '../../domain/help/help-answers';
import { helpSearchInputSchema, HelpSearchInput } from '../../validation/ask-vera-tools.schemas';
import { AskVeraToolFeature, AskVeraToolPort } from '../ask-vera-tool.port';

@Injectable()
export class HelpSearchTool extends AskVeraToolPort {
    public readonly name: string = 'help_search';
    public readonly feature: AskVeraToolFeature = ASK_VERA_HELP_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof helpSearchInputSchema = helpSearchInputSchema;

    public constructor(private readonly context: AppContext) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Busca no catálogo de ajuda do produto (o que cada tela faz, como fazer tarefas comuns, o que é Free e Premium, o que a Vera não faz). Devolve até 3 entradas com texto, passos e o link da tela. Não usa dados da conta.'
            : 'Searches the product help catalog (what each screen does, how to do common tasks, what is Free and Premium, what Vera does not do). Returns up to 3 entries with text, steps and the screen link. Uses no account data.';
    }

    public run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: HelpSearchInput = helpSearchInputSchema.parse(input);
        return Promise.resolve({ payload: helpSearchPayload(HELP_CATALOG, parsed.query, this.context.get().locale) });
    }
}
