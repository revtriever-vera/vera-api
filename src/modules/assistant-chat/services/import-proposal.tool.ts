import { z, ZodTypeAny } from 'zod';
import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { ASK_VERA_HELP_FEATURE, ASK_VERA_TOOL_KINDS } from '../../ai-assistant/services/ask-vera.service';
import { AskVeraToolFeature, AskVeraToolKind, AskVeraToolOutput, AskVeraToolPort } from '../../ai-assistant/services/ask-vera-tool.port';
import { INVESTMENT_IMPORT_TOOL } from '../../investment-import/services/investment-import-assistant.service';

export class ImportProposalTool extends AskVeraToolPort {
    public readonly name: string = INVESTMENT_IMPORT_TOOL;
    public readonly feature: AskVeraToolFeature = ASK_VERA_HELP_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.proposal;
    public readonly inputSchema: ZodTypeAny = z.object({}).strict();

    public constructor(
        private readonly summary: string,
        private readonly payload: JsonObject
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Propõe importar o arquivo que a pessoa anexou. Não recebe nada e não devolve linhas nem valores: a pessoa confere a tabela e confirma no cartão, e quem importa é o sistema. Nunca diga que importou.'
            : 'Proposes importing the file the person attached. It takes nothing and returns no lines or amounts: the person checks the table and confirms on the card, and the system imports. Never say it was imported.';
    }

    public run(_input: unknown): Promise<AskVeraToolOutput> {
        return Promise.resolve({ payload: { status: 'proposed' }, proposal: { summary: this.summary, payload: this.payload } });
    }
}
