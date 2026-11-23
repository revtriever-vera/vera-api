import { Injectable } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { AskVeraToolOutput, AskVeraToolPort, PaidFeature } from '../../ai-assistant/services/ask-vera-tool.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { OVERVIEW_TOPICS, overviewToolInputSchema } from '../validation/recurring.schemas';
import { daysUntilSunday, subscriptionsText, weekText } from '../domain/recurring-tool-texts';
import { RecurringTotalsSummary, RecurringUpcomingService, UpcomingDebit } from './recurring-upcoming.service';

type ToolKind = AskVeraToolPort['kind'];

@Injectable()
export class RecurringOverviewTool extends AskVeraToolPort {
    public readonly name: string = 'recurring_overview';
    public readonly feature: PaidFeature = 'whatsapp';
    public readonly kind: ToolKind = 'direct';
    public readonly inputSchema: ZodTypeAny = overviewToolInputSchema;

    public constructor(
        private readonly upcoming: RecurringUpcomingService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Mostra à pessoa o que vence esta semana nas assinaturas e contas recorrentes dela (topic week) ou quanto ela paga por mês e por ano em assinaturas (topic subscriptions). Use quando ela perguntar o que vence ou quanto paga de assinatura. A resposta sai pronta, com nomes e valores, e não volta para você.'
            : 'Shows the person what falls due this week in their recurring subscriptions and bills (topic week) or how much they pay per month and per year in subscriptions (topic subscriptions). Use when they ask what is due or how much they pay in subscriptions. The answer is sent ready, with names and amounts, and does not come back to you.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: z.infer<typeof overviewToolInputSchema> = overviewToolInputSchema.parse(input);
        const locale: AppLocale = this.context.get().locale;
        const today: string = await this.timezones.todayInCompany();
        const text: string =
            parsed.topic === OVERVIEW_TOPICS.week ? await this.weekOf(today, locale) : await this.subscriptionsOf(today, locale);
        return { payload: {}, text };
    }

    private async weekOf(today: string, locale: AppLocale): Promise<string> {
        const debits: UpcomingDebit[] = await this.upcoming.debitsFrom(today, daysUntilSunday(today));
        return weekText(debits, locale);
    }

    private async subscriptionsOf(today: string, locale: AppLocale): Promise<string> {
        const totals: RecurringTotalsSummary = await this.upcoming.totals(today);
        return subscriptionsText(
            {
                monthlyMinor: totals.subscriptionMonthlyMinor,
                yearlyMinor: totals.subscriptionMonthlyMinor * 12,
                count: totals.subscriptionCount
            },
            locale
        );
    }
}
