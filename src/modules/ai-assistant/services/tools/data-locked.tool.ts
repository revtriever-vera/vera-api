import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppContext } from '../../../../core/context/app-context.port';
import { AppLocale } from '../../../../shared/i18n/locale';
import { PlanGateService } from '../../../plans/services/plan-gate.service';
import { ASK_VERA_HELP_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { DATA_LOCKED_TOOL, DATA_LOCKS, DataLock, dataLockedPayload } from '../../domain/data-locked';
import { AskVeraToolFeature, AskVeraToolPort } from '../ask-vera-tool.port';
import { AiConsentService } from '../ai-consent.service';

const noInputSchema: z.ZodObject<Record<string, never>, 'strict'> = z.object({}).strict();

export { DATA_LOCKED_TOOL };

@Injectable()
export class DataLockedTool extends AskVeraToolPort {
    public readonly name: string = DATA_LOCKED_TOOL;
    public readonly feature: AskVeraToolFeature = ASK_VERA_HELP_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof noInputSchema = noInputSchema;

    public constructor(
        private readonly context: AppContext,
        private readonly gate: PlanGateService,
        private readonly consent: AiConsentService
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Use quando a pergunta pede os números da pessoa ou do mercado e você não tem ferramenta de dados. Devolve por que não dá (plano ou permissão) e o link da tela. Não usa dados da conta.'
            : 'Use when the question asks for the person numbers or the market and you have no data tool. Returns why it is not possible (plan or permission) and the screen link. Uses no account data.';
    }

    public async run(): Promise<AskVeraToolOutput> {
        const lock: DataLock = (await this.gate.allows('ai')) ? DATA_LOCKS.permission : DATA_LOCKS.premium;
        return { payload: dataLockedPayload(lock, this.context.get().locale) };
    }
}
