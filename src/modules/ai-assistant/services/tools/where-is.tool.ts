import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../../../core/llm/llm.types';
import { AppContext } from '../../../../core/context/app-context.port';
import { AppLocale } from '../../../../shared/i18n/locale';
import { CurrentUserService } from '../../../identity/services/current-user.service';
import { hasRole } from '../../../identity/services/role-rank';
import { ASK_VERA_HELP_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { HELP_CATALOG } from '../../domain/help/help-catalog';
import { whereIsPayload } from '../../domain/help/help-answers';
import { whereIsInputSchema, WhereIsInput } from '../../validation/ask-vera-tools.schemas';
import { AskVeraToolFeature, AskVeraToolPort } from '../ask-vera-tool.port';

@Injectable()
export class WhereIsTool extends AskVeraToolPort {
    public readonly name: string = 'where_is';
    public readonly feature: AskVeraToolFeature = ASK_VERA_HELP_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof whereIsInputSchema = whereIsInputSchema;

    public constructor(
        private readonly context: AppContext,
        private readonly users: CurrentUserService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Diz em que tela do app fica um assunto, com o link e o papel que a abre. Telas que o papel da pessoa não abre voltam em semAcesso, sem link. Não usa dados da conta.'
            : 'Says which app screen holds a topic, with the link and the role that opens it. Screens the person role cannot open come back in semAcesso, with no link. Uses no account data.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: WhereIsInput = whereIsInputSchema.parse(input);
        const role: string = (await this.users.require()).role;
        const payload: JsonObject = whereIsPayload(HELP_CATALOG, parsed.topic, this.context.get().locale, (min): boolean =>
            hasRole(role, min ?? 'viewer')
        );
        return { payload };
    }
}
