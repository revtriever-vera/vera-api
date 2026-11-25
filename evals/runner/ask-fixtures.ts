import { AppContext, AppContextData } from '../../src/core/context/app-context.port';
import { JsonObject } from '../../src/core/llm/llm.types';
import { AppLocale } from '../../src/shared/i18n/locale';
import { AskVeraTool, AskVeraToolOutput } from '../../src/modules/ai-assistant/domain/ask-vera.types';
import {
    byCategoryInputSchema,
    contributionInputSchema,
    cutsInputSchema,
    monthSummaryInputSchema,
    noInputSchema
} from '../../src/modules/ai-assistant/validation/ask-vera-tools.schemas';
import { HELP_CATALOG } from '../../src/modules/ai-assistant/domain/help/help-catalog';
import { HelpRole } from '../../src/modules/ai-assistant/domain/help/help.types';
import { HelpSearchTool } from '../../src/modules/ai-assistant/services/tools/help-search.tool';
import { WhereIsTool } from '../../src/modules/ai-assistant/services/tools/where-is.tool';
import type { CurrentUserService } from '../../src/modules/identity/services/current-user.service';
import { AskCase, SummaryCase } from './case.schemas';
import { casesOf, keysOf, numbersOf } from './cases';

export const ASK_TODAY: string = '2026-03-20';

const REFERENCE_IDS: Readonly<Record<AppLocale, string>> = { 'pt-BR': 'referencia-prototipo', en: 'reference-prototype' };

const DESCRIPTIONS: Readonly<Record<string, Readonly<Record<AppLocale, string>>>> = {
    list_categories: {
        'pt-BR': 'Lista as chaves e os rótulos padrão das categorias de gasto, para achar a chave de um termo como "delivery".',
        en: 'Lists the keys and default labels of the spending categories, to find the key for a term like "delivery".'
    },
    spending_month_summary: {
        'pt-BR': 'Resumo de um mês: renda, gastos, quanto sobrou, meta de economia e gastos por categoria.',
        en: 'Summary of one month: income, spending, what was left, savings goal and spending per category.'
    },
    spending_cuts: {
        'pt-BR': 'Quanto falta para a meta de economia e onde cortar gastos flexíveis.',
        en: 'How much is missing for the savings goal and where to cut flexible spending.'
    },
    spending_by_category: {
        'pt-BR': 'Total gasto por mês em uma categoria (ou em todas) num período de até 12 meses.',
        en: 'Amount spent per month in one category (or all) over a period of up to 12 months.'
    },
    portfolio_overview: {
        'pt-BR': 'Total da carteira, exposição ao dólar e cada classe de ativo contra a meta.',
        en: 'Portfolio total, dollar exposure and each asset class against its target.'
    },
    contribution_suggestion: {
        'pt-BR': 'Sugestão de para onde vai um aporte de um valor dado.',
        en: 'Suggestion of where a contribution of a given amount goes.'
    }
};

function referenceOf(task: SummaryCase['task'], locale: AppLocale): SummaryCase {
    const found: SummaryCase | undefined = (casesOf(task) as SummaryCase[]).find(
        (item: SummaryCase): boolean => item.id === REFERENCE_IDS[locale]
    );
    if (found === undefined) {
        throw new Error(`reference case of ${task} not found`);
    }
    return found;
}

function outputOf(item: SummaryCase, payload: JsonObject): AskVeraToolOutput {
    return { payload, numbers: numbersOf(item), keys: keysOf(item) };
}

function toolOf(name: string, schema: AskVeraTool['inputSchema'], locale: AppLocale, payload: () => AskVeraToolOutput): AskVeraTool {
    return {
        name,
        kind: 'read',
        inputSchema: schema,
        description: (): string => DESCRIPTIONS[name]?.[locale] ?? name,
        run: (): Promise<AskVeraToolOutput> => Promise.resolve(payload())
    };
}

function categoriesPayload(month: SummaryCase): JsonObject {
    if (month.task !== 'summary_month') {
        return {};
    }
    return {
        categorias: month.context.gastos_por_categoria.map((entry): JsonObject => ({
            chave: entry.chave,
            rotulo_padrao: entry.rotulo_padrao ?? null
        }))
    };
}

export function fixtureToolsOf(locale: AppLocale): readonly AskVeraTool[] {
    const month: SummaryCase = referenceOf('summary_month', locale);
    const cuts: SummaryCase = referenceOf('summary_cuts', locale);
    const portfolio: SummaryCase = referenceOf('summary_portfolio', locale);
    const asJson = (item: SummaryCase): JsonObject => JSON.parse(JSON.stringify(item.context)) as JsonObject;
    return [
        toolOf('list_categories', noInputSchema, locale, (): AskVeraToolOutput => ({
            payload: categoriesPayload(month),
            numbers: [],
            keys: keysOf(month)
        })),
        toolOf('spending_month_summary', monthSummaryInputSchema, locale, (): AskVeraToolOutput => outputOf(month, asJson(month))),
        toolOf('spending_cuts', cutsInputSchema, locale, (): AskVeraToolOutput => outputOf(cuts, asJson(cuts))),
        toolOf('spending_by_category', byCategoryInputSchema, locale, (): AskVeraToolOutput => outputOf(month, asJson(month))),
        toolOf('portfolio_overview', noInputSchema, locale, (): AskVeraToolOutput => outputOf(portfolio, asJson(portfolio))),
        toolOf('contribution_suggestion', contributionInputSchema, locale, (): AskVeraToolOutput => outputOf(portfolio, asJson(portfolio)))
    ];
}

class EvalContext extends AppContext {
    public constructor(private readonly locale: AppLocale) {
        super();
    }

    public run<T>(_data: AppContextData, fn: () => T): T {
        return fn();
    }

    public get(): AppContextData {
        return { requestId: 'eval', locale: this.locale };
    }

    public getOrNull(): AppContextData {
        return this.get();
    }

    public enrich(): void {
        return undefined;
    }
}

export function helpToolsOf(locale: AppLocale, role: HelpRole): readonly AskVeraTool[] {
    const context: EvalContext = new EvalContext(locale);
    const users: CurrentUserService = {
        require: (): Promise<{ role: HelpRole }> => Promise.resolve({ role })
    } as unknown as CurrentUserService;
    return [new HelpSearchTool(context), new WhereIsTool(context, users)];
}

export function appToolsOf(item: AskCase): readonly AskVeraTool[] {
    const help: readonly AskVeraTool[] = helpToolsOf(item.locale, item.role);
    return item.plan === 'free' ? help : [...fixtureToolsOf(item.locale), ...help];
}

function helpEvidenceOf(locale: AppLocale): JsonObject[] {
    return HELP_CATALOG.map((entry): JsonObject => ({
        titulo: entry.texts[locale].title,
        body: entry.texts[locale].body,
        link: entry.screen?.path ?? null,
        plano: entry.plans === 'premium' ? 'premium' : 'todos'
    }));
}

export async function evidenceOf(item: AskCase): Promise<string> {
    const tools: readonly AskVeraTool[] = fixtureToolsOf(item.locale);
    const outputs: AskVeraToolOutput[] = await Promise.all(tools.map((tool: AskVeraTool): Promise<AskVeraToolOutput> => tool.run({})));
    const data: JsonObject[] = outputs.map((output: AskVeraToolOutput): JsonObject => output.payload);
    return JSON.stringify(item.task === 'ask_vera_app_step' ? [...data, ...helpEvidenceOf(item.locale)] : data);
}
