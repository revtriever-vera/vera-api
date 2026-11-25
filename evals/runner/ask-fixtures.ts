import { AppContext, AppContextData } from '../../src/core/context/app-context.port';
import { JsonObject } from '../../src/core/llm/llm.types';
import { AppLocale } from '../../src/shared/i18n/locale';
import { AskVeraTool, AskVeraToolOutput } from '../../src/modules/ai-assistant/domain/ask-vera.types';
import {
    benchmarksInputSchema,
    byCategoryInputSchema,
    contributionInputSchema,
    cutsInputSchema,
    monthSummaryInputSchema,
    maturitiesInputSchema,
    noInputSchema
} from '../../src/modules/ai-assistant/validation/ask-vera-tools.schemas';
import { lastDayOfMonth, proposalSummary as goalSummary } from '../../src/modules/goals/domain/goal-assistant-texts';
import { GoalCreateInput, goalCreateInputSchema } from '../../src/modules/goals/validation/goal-proposal.schemas';
import { proposalSummary as transactionSummary } from '../../src/modules/transactions/domain/transaction-assistant-texts';
import { transactionCategorizeInputSchema } from '../../src/modules/transactions/validation/transaction-proposal.schemas';
import { buildBenchmarksContext } from '../../src/modules/ai-assistant/domain/context/benchmarks.context';
import { buildConcentrationContext } from '../../src/modules/ai-assistant/domain/context/concentration.context';
import { buildMaturitiesContext } from '../../src/modules/ai-assistant/domain/context/maturities.context';
import { HELP_CATALOG } from '../../src/modules/ai-assistant/domain/help/help-catalog';
import { HelpRole } from '../../src/modules/ai-assistant/domain/help/help.types';
import { HelpSearchTool } from '../../src/modules/ai-assistant/services/tools/help-search.tool';
import { DataLockedTool } from '../../src/modules/ai-assistant/services/tools/data-locked.tool';
import type { PlanGateService } from '../../src/modules/plans/services/plan-gate.service';
import type { AiConsentService } from '../../src/modules/ai-assistant/services/ai-consent.service';
import { WhereIsTool } from '../../src/modules/ai-assistant/services/tools/where-is.tool';
import type { CurrentUserService } from '../../src/modules/identity/services/current-user.service';
import type { ConcentrationResponse } from '../../src/modules/concentration/services/concentration-reader.service';
import type { BenchmarkWindows } from '../../src/modules/market-benchmarks/services/benchmark.service';
import type { MaturityItem } from '../../src/modules/fixed-income-schedule/services/maturities-reader.service';
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
    concentration_overview: {
        'pt-BR': 'Concentração da carteira: valor e percentual por emissor e por setor das ações.',
        en: 'Portfolio concentration: value and share per issuer and per sector of the equities.'
    },
    fixed_income_maturities: {
        'pt-BR': 'Vencimentos da renda fixa nos próximos meses, por tipo de título.',
        en: 'Fixed income maturities in the coming months, per kind of security.'
    },
    market_benchmarks: {
        'pt-BR':
            'Indicadores de referência do mercado já acumulados: CDI e IPCA, Selic meta e Ibovespa, com a data até onde vão e a fonte.',
        en: 'Ready-made market reference figures: CDI and IPCA, the Selic target and the Ibovespa, with the date they run to and the source.'
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

const CONCENTRATION_FIXTURE: ConcentrationResponse = {
    asOf: '2026-03-20',
    baseCurrency: 'BRL',
    totalMinor: 41_200_000,
    equityTotalMinor: 20_000_000,
    byIssuer: [
        {
            key: 'tesouro-nacional',
            kind: 'group',
            name: 'Tesouro Nacional',
            valueMinor: 12_360_000,
            shareBps: 3000,
            assets: [],
            moreCount: 0
        },
        { key: 'itau-unibanco', kind: 'group', name: 'Itaú Unibanco', valueMinor: 6_180_000, shareBps: 1500, assets: [], moreCount: 0 },
        { key: 'crypto', kind: 'bucket', name: null, valueMinor: 2_060_000, shareBps: 500, assets: [], moreCount: 0 }
    ],
    byIssuerOthers: { valueMinor: 20_600_000, shareBps: 5000, groups: 9 },
    bySector: [
        { key: 'financeiro', valueMinor: 9_000_000, shareBps: 4500, assets: [], moreCount: 0 },
        { key: 'tecnologia', valueMinor: 5_000_000, shareBps: 2500, assets: [], moreCount: 0 }
    ]
};

function maturityOf(kind: string | null, maturityDate: string, estimatedValueMinor: number): MaturityItem {
    return {
        holdingKind: kind === null ? 'position' : 'fixed_income',
        id: `fixture-${maturityDate}`,
        name: 'fixture',
        issuerName: null,
        kind,
        maturityDate,
        daysToMaturity: 30,
        soon: false,
        estimatedValueMinor,
        currency: 'BRL',
        reallocateMinor: estimatedValueMinor,
        estimated: false,
        basis: 'contract',
        taxRegime: null,
        isSample: false
    };
}

const MATURITIES_FIXTURE: readonly MaturityItem[] = [
    maturityOf('cdb', '2026-05-12', 2_000_000),
    maturityOf('lci', '2026-08-03', 1_500_000),
    maturityOf(null, '2026-11-15', 800_000)
];

const NO_WINDOWS: BenchmarkWindows['cdi']['windows'] = { m1: null, m3: null, m6: null, m12: null, m24: null, m36: null, ytd: null };

const BENCHMARKS_FIXTURE: BenchmarkWindows = {
    asOf: '2026-03-20',
    cdi: {
        source: 'Banco Central, série 12',
        lastDate: '2026-03-19',
        stale: false,
        windows: { m1: 105, m3: 310, m6: 620, m12: 1280, m24: 2540, m36: 3900, ytd: 290 }
    },
    ipca: {
        source: 'Banco Central, série 433',
        lastDate: '2026-02-01',
        stale: false,
        windows: { m1: 45, m3: 120, m6: 240, m12: 480, m24: 980, m36: 1500, ytd: 90 }
    },
    selicTarget: { source: 'Banco Central, série 432', lastDate: '2026-03-19', stale: false, bps: 1475 },
    ibovespa: {
        state: 'ok',
        source: 'brapi',
        lastDate: '2026-03-19',
        stale: false,
        windows: { ...NO_WINDOWS, m1: -220, m3: 340, m6: 780, m12: 1650, ytd: 410 }
    }
};

export function appFixtureToolsOf(locale: AppLocale): readonly AskVeraTool[] {
    const concentration: ReturnType<typeof buildConcentrationContext> = buildConcentrationContext(CONCENTRATION_FIXTURE, locale);
    const maturities: ReturnType<typeof buildMaturitiesContext> = buildMaturitiesContext(MATURITIES_FIXTURE, '2027-03', locale);
    const benchmarks: ReturnType<typeof buildBenchmarksContext> = buildBenchmarksContext(BENCHMARKS_FIXTURE, undefined, locale);
    return [
        toolOf('concentration_overview', noInputSchema, locale, (): AskVeraToolOutput => ({
            payload: jsonOf(concentration.payload),
            numbers: concentration.numbers,
            keys: concentration.keys
        })),
        toolOf('fixed_income_maturities', maturitiesInputSchema, locale, (): AskVeraToolOutput => ({
            payload: jsonOf(maturities.payload),
            numbers: maturities.numbers,
            keys: maturities.keys
        })),
        toolOf('market_benchmarks', benchmarksInputSchema, locale, (): AskVeraToolOutput => ({
            payload: jsonOf(benchmarks.payload),
            numbers: benchmarks.numbers,
            keys: benchmarks.keys
        }))
    ];
}

function jsonOf(value: object): JsonObject {
    return JSON.parse(JSON.stringify(value)) as JsonObject;
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

export function freeToolsOf(locale: AppLocale, role: HelpRole): readonly AskVeraTool[] {
    const gate: PlanGateService = { allows: (): Promise<boolean> => Promise.resolve(false) } as unknown as PlanGateService;
    const consent: AiConsentService = {} as unknown as AiConsentService;
    return [...helpToolsOf(locale, role), new DataLockedTool(new EvalContext(locale), gate, consent)];
}

export function canProposeIn(item: AskCase): boolean {
    return item.task === 'ask_vera_app_step' && item.plan === 'premium' && item.role !== 'viewer';
}

function proposalToolOf(name: string, schema: AskVeraTool['inputSchema'], summaryOf: (input: JsonObject) => string): AskVeraTool {
    return {
        name,
        kind: 'proposal',
        inputSchema: schema,
        description: (): string => name,
        run: (input: unknown): Promise<AskVeraToolOutput> =>
            Promise.resolve({
                payload: { status: 'proposed' },
                proposal: { summary: summaryOf(input as JsonObject), payload: input as JsonObject }
            })
    };
}

export function proposalToolsOf(locale: AppLocale): readonly AskVeraTool[] {
    const categoryLabel: string = locale === 'pt-BR' ? 'Delivery e restaurantes' : 'Delivery and restaurants';
    return [
        proposalToolOf('goal_create', goalCreateInputSchema, (input: JsonObject): string => {
            const goal: GoalCreateInput = goalCreateInputSchema.parse(input);
            return goalSummary(goal.name, goal.targetMinor, lastDayOfMonth(goal.targetMonth), locale);
        }),
        proposalToolOf('transaction_categorize', transactionCategorizeInputSchema, (input: JsonObject): string =>
            transactionSummary(categoryLabel, input['always'] === true, locale)
        )
    ];
}

export function appToolsOf(item: AskCase): readonly AskVeraTool[] {
    if (item.plan === 'free') {
        return freeToolsOf(item.locale, item.role);
    }
    const proposals: readonly AskVeraTool[] = canProposeIn(item) ? proposalToolsOf(item.locale) : [];
    return [...fixtureToolsOf(item.locale), ...appFixtureToolsOf(item.locale), ...helpToolsOf(item.locale, item.role), ...proposals];
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
    const tools: readonly AskVeraTool[] =
        item.task === 'ask_vera_app_step'
            ? [...fixtureToolsOf(item.locale), ...appFixtureToolsOf(item.locale)]
            : fixtureToolsOf(item.locale);
    const outputs: AskVeraToolOutput[] = await Promise.all(tools.map((tool: AskVeraTool): Promise<AskVeraToolOutput> => tool.run({})));
    const data: JsonObject[] = outputs.map((output: AskVeraToolOutput): JsonObject => output.payload);
    return JSON.stringify(item.task === 'ask_vera_app_step' ? [...data, ...helpEvidenceOf(item.locale)] : data);
}
