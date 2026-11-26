import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { AskVeraToolOutput, AskVeraToolPort, PaidFeature } from '../../ai-assistant/services/ask-vera-tool.port';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ClassKeyResolution, classIdOfKey, portfolioNewsOutputOf } from '../domain/portfolio-news-output';
import { ChangeItem } from '../domain/portfolio-changes.types';
import { NEWS_TOOL_DEFAULT_DAYS, PortfolioNewsInput, portfolioNewsInputSchema } from '../validation/portfolio-news.schemas';
import { PortfolioChangesReaderService } from './portfolio-changes-reader.service';

type ToolKind = AskVeraToolPort['kind'];

@Injectable()
export class PortfolioNewsTool extends AskVeraToolPort {
    public readonly name: string = 'portfolio_news';
    public readonly feature: PaidFeature = 'ai';
    public readonly kind: ToolKind = 'read';
    public readonly inputSchema: typeof portfolioNewsInputSchema = portfolioNewsInputSchema;

    public constructor(
        private readonly reader: PortfolioChangesReaderService,
        private readonly portfolio: PortfolioSnapshotService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'O que saiu de novo (fatos relevantes, resultados, proventos, relatórios) sobre os ativos que a pessoa tem na carteira, lido do feed pronto: até 5 itens com ativo, tipo, data, resumo e o peso do ativo na carteira. Filtra por classe (classId, a chave que portfolio_overview devolveu), por ativo (assetKey, o código) e por janela em dias (até 30; 7 se omitida). Só informa o que foi publicado: não julga se é bom ou ruim e não diz o que fazer.'
            : 'What is new (material facts, earnings, income, reports) about the assets the person holds, read from the ready feed: up to 5 items with asset, type, date, summary and the weight of the asset in the portfolio. Filters by class (classId, the key portfolio_overview returned), by asset (assetKey, the ticker) and by window in days (up to 30; 7 when omitted). It only reports what was published: it does not judge whether it is good or bad and does not say what to do.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: PortfolioNewsInput = portfolioNewsInputSchema.parse(input);
        const days: number = parsed.days ?? NEWS_TOOL_DEFAULT_DAYS;
        const classId: string | null | undefined = await this.classIdOf(parsed.classId);
        if (classId === undefined) {
            return { payload: { status: 'class_not_found' } };
        }
        const items: ChangeItem[] = await this.reader.items({ days, classId, holder: ANY_HOLDER });
        return portfolioNewsOutputOf(items, parsed.assetKey, days, this.context.get().locale);
    }

    private async classIdOf(key: string | undefined): Promise<string | null | undefined> {
        if (key === undefined) {
            return null;
        }
        const snapshot: PortfolioSnapshot = await this.portfolio.build(ANY_HOLDER);
        const resolved: ClassKeyResolution = classIdOfKey(snapshot.classes, key);
        return resolved.found ? resolved.classId : undefined;
    }
}
