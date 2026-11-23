import { Injectable } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { AskVeraToolOutput, AskVeraToolPort, PaidFeature } from '../../ai-assistant/services/ask-vera-tool.port';
import { overviewText } from '../domain/goals-overview-text';
import { GoalView } from '../validation/goals.schemas';
import { GoalsReaderService } from './goals-reader.service';

type ToolKind = AskVeraToolPort['kind'];

@Injectable()
export class GoalsOverviewTool extends AskVeraToolPort {
    public readonly name: string = 'goals_overview';
    public readonly feature: PaidFeature = 'whatsapp';
    public readonly kind: ToolKind = 'direct';
    public readonly inputSchema: ZodTypeAny = z.object({});

    public constructor(
        private readonly reader: GoalsReaderService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Mostra à pessoa como estão os objetivos dela: saldo, valor alvo, percentual e situação. Use quando ela perguntar como está a reserva, a viagem ou os objetivos.'
            : 'Shows the person how their goals are doing: balance, target, percentage and status. Use when they ask about their reserve, a trip or their goals.';
    }

    public async run(): Promise<AskVeraToolOutput> {
        const goals: GoalView[] = await this.reader.overview();
        return { payload: {}, text: overviewText(goals, this.context.get().locale) };
    }
}
