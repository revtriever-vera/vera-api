import { AppContext, AppContextData } from '../../src/core/context/app-context.port';
import { JsonObject } from '../../src/core/llm/llm.types';
import { AppLocale } from '../../src/shared/i18n/locale';
import { AskVeraTool, AskVeraToolOutput } from '../../src/modules/ai-assistant/domain/ask-vera.types';
import {
    assetLookupInputSchema,
    benchmarksInputSchema,
    byCategoryInputSchema,
    contributionInputSchema,
    cutsInputSchema,
    fixedIncomeBenchmarkInputSchema,
    fundPerformanceInputSchema,
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
import {
    buildAssetLookupContext,
    buildFixedIncomeBenchmarkContext,
    buildFundPerformanceContext
} from '../../src/modules/ai-assistant/domain/context/research.context';
import { portfolioNewsOutputOf } from '../../src/modules/portfolio-watch/domain/portfolio-news-output';
import type { ChangeItem } from '../../src/modules/portfolio-watch/domain/portfolio-changes.types';
import { PortfolioNewsInput, portfolioNewsInputSchema } from '../../src/modules/portfolio-watch/validation/portfolio-news.schemas';
import { HELP_CATALOG } from '../../src/modules/ai-assistant/domain/help/help-catalog';
import { HelpRole } from '../../src/modules/ai-assistant/domain/help/help.types';
import { HelpSearchTool } from '../../src/modules/ai-assistant/services/tools/help-search.tool';
import { DataLockedTool } from '../../src/modules/ai-assistant/services/tools/data-locked.tool';
import type { PlanGateService } from '../../src/modules/plans/services/plan-gate.service';
import type { AiConsentService } from '../../src/modules/ai-assistant/services/ai-consent.service';
import { WhereIsTool } from '../../src/modules/ai-assistant/services/tools/where-is.tool';
import type { CurrentUserService } from '../../src/modules/identity/services/current-user.service';
import type { ConcentrationResponse } from '../../src/modules/concentration/services/concentration-reader.service';
import type { LookupEntry } from '../../src/modules/market-benchmarks/services/asset-lookup.service';
import type { BenchmarkWindows } from '../../src/modules/market-benchmarks/services/benchmark.service';
import type { FixedIncomeComparison } from '../../src/modules/market-benchmarks/services/fixed-income-benchmark.service';
import type { FundPerformance } from '../../src/modules/market-benchmarks/services/fund-performance.service';
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
    asset_lookup: {
        'pt-BR': 'Pesquisa um ativo ou fundo pelo nome ou código: tipo, classe, mercado e última cotação com a data.',
        en: 'Looks an asset or fund up by name or code: type, class, market and the latest quote with its date.'
    },
    fund_performance: {
        'pt-BR': 'Rentabilidade passada da cota de um fundo em 1, 3, 6, 12 e 36 meses contra o CDI, com a diferença já calculada.',
        en: 'Past return of a fund quota over 1, 3, 6, 12 and 36 months against the CDI, with the difference already computed.'
    },
    portfolio_news: {
        'pt-BR': 'O que saiu de novo (fatos relevantes, resultados, proventos) sobre os ativos da carteira, com o peso de cada um.',
        en: 'What is new (material facts, earnings, income) about the portfolio assets, with the weight of each one.'
    },
    fixed_income_vs_benchmark: {
        'pt-BR': 'Compara um título de renda fixa da carteira com o CDI e o IPCA de 12 meses; sem a chave, lista os títulos.',
        en: 'Compares a fixed income security of the portfolio with the 12-month CDI and IPCA; without the key it lists the securities.'
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

function toolOf(
    name: string,
    schema: AskVeraTool['inputSchema'],
    locale: AppLocale,
    payload: (input: unknown) => AskVeraToolOutput
): AskVeraTool {
    return {
        name,
        kind: 'read',
        inputSchema: schema,
        description: (): string => DESCRIPTIONS[name]?.[locale] ?? name,
        run: (input: unknown): Promise<AskVeraToolOutput> => Promise.resolve(payload(input))
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

const LOOKUP_BASE: Pick<LookupEntry, 'typeGroup' | 'suggestedClassKey' | 'currency' | 'market' | 'kind'> = {
    typeGroup: 'acoes_br',
    suggestedClassKey: 'acoes_br',
    currency: 'BRL',
    market: 'B3',
    kind: 'stock'
};

const LOOKUP_FIXTURE: readonly LookupEntry[] = [
    {
        ...LOOKUP_BASE,
        externalId: 'PETR4',
        symbol: 'PETR4',
        name: 'Petrobras PN',
        quote: { price: '38.52', currency: 'BRL', date: '2026-03-19', stale: false }
    },
    {
        ...LOOKUP_BASE,
        externalId: 'VALE3',
        symbol: 'VALE3',
        name: 'Vale ON',
        quote: { price: '61.9', currency: 'BRL', date: '2026-03-19', stale: false }
    },
    {
        ...LOOKUP_BASE,
        externalId: '11111111000191',
        symbol: 'ALFA',
        name: 'Fundo Alfa Referenciado DI',
        typeGroup: 'fundos',
        suggestedClassKey: null,
        market: 'CVM',
        kind: 'fund',
        quote: null
    }
];

const FUND_FIXTURE: FundPerformance = {
    state: 'ok',
    name: 'Fundo Alfa Referenciado DI',
    lastDate: '2026-03-19',
    stale: false,
    complete: true,
    cdiLastDate: '2026-03-19',
    cdiSource: 'Banco Central, série 12',
    source: 'CVM, informe diário',
    windows: {
        m1: { fundBps: 98, cdiBps: 105, differenceBps: -7 },
        m3: { fundBps: 330, cdiBps: 310, differenceBps: 20 },
        m6: { fundBps: 700, cdiBps: 620, differenceBps: 80 },
        m12: { fundBps: 1410, cdiBps: 1280, differenceBps: 130 }
    },
    missing: ['m36']
};

const FIXED_INCOME_REFERENCE: FixedIncomeComparison['reference'] = {
    cdi12Bps: 1280,
    cdiLastDate: '2026-03-19',
    cdiSource: 'Banco Central, série 12',
    ipca12Bps: 480,
    ipcaLastDate: '2026-02-01',
    ipcaSource: 'Banco Central, série 433'
};

const FIXED_INCOME_TITLES: FixedIncomeComparison['titles'] = [
    {
        key: 'rf1',
        kind: 'cdb',
        indexer: 'cdi_percent',
        rateBps: 11000,
        appliedAt: '2025-06-10',
        nominalAnnualBps: 1408,
        realAnnualBps: 880,
        beatsInflation: true,
        versusCdiBps: 128,
        estimated: true
    },
    {
        key: 'rf2',
        kind: 'lci',
        indexer: 'prefixed',
        rateBps: 1050,
        appliedAt: '2025-09-02',
        nominalAnnualBps: 1050,
        realAnnualBps: 540,
        beatsInflation: true,
        versusCdiBps: -230,
        estimated: false
    }
];

const NEWS_BASE: Omit<ChangeItem, 'id' | 'assetId' | 'symbol' | 'kind' | 'date' | 'summary' | 'relevance' | 'weightBps' | 'weightLine'> = {
    source: 'b3_fnet',
    category: 'fato_relevante',
    title: 'fixture',
    summaryAvailable: true,
    documentUrl: 'https://fnet.example/fixture'
};

const NEWS_FIXTURE: readonly ChangeItem[] = [
    {
        ...NEWS_BASE,
        id: 'news-1',
        assetId: 'a-vale3',
        symbol: 'VALE3',
        kind: 'relevant_fact',
        date: '2026-03-18',
        summary: 'A empresa anunciou a revisão da meta de produção de minério de ferro para o ano.',
        relevance: 3,
        weightBps: 1500,
        weightLine: null
    },
    {
        ...NEWS_BASE,
        id: 'news-2',
        assetId: 'a-xplg11',
        symbol: 'XPLG11',
        kind: 'management',
        date: '2026-03-12',
        summary: 'O fundo manteve a vacância física em 4% e distribuiu R$ 0,78 por cota no mês.',
        relevance: 2,
        weightBps: 800,
        weightLine: null
    },
    {
        ...NEWS_BASE,
        id: 'news-3',
        assetId: 'a-hglg11',
        symbol: 'HGLG11',
        kind: 'income',
        date: '2026-03-10',
        summary: 'O fundo anunciou rendimento de R$ 1,10 por cota, com pagamento em abril.',
        relevance: 2,
        weightBps: 500,
        weightLine: null
    }
];

function portfolioNewsOutput(input: unknown, locale: AppLocale): AskVeraToolOutput {
    const parsed: PortfolioNewsInput | undefined = portfolioNewsInputSchema.safeParse(input).data;
    const items: readonly ChangeItem[] =
        parsed?.classId === 'fiis' ? NEWS_FIXTURE.filter((item: ChangeItem): boolean => item.symbol.endsWith('11')) : NEWS_FIXTURE;
    return portfolioNewsOutputOf(items, parsed?.assetKey, parsed?.days ?? 7, locale);
}

function lookupOf(input: unknown): readonly LookupEntry[] {
    const query: string = (assetLookupInputSchema.safeParse(input).data?.query ?? '').toLowerCase();
    const words: readonly string[] = query.split(/\s+/).filter((word: string): boolean => word.length >= 3);
    return LOOKUP_FIXTURE.filter((entry: LookupEntry): boolean =>
        words.some((word: string): boolean => `${entry.name} ${entry.symbol}`.toLowerCase().includes(word))
    );
}

function fixedIncomeOf(input: unknown): FixedIncomeComparison {
    const key: string | undefined = fixedIncomeBenchmarkInputSchema.safeParse(input).data?.holdingKey;
    if (key === undefined) {
        return { state: 'list', reference: FIXED_INCOME_REFERENCE, titles: FIXED_INCOME_TITLES };
    }
    const chosen: FixedIncomeComparison['titles'] = FIXED_INCOME_TITLES.filter((title): boolean => title.key === key);
    return { state: chosen.length === 0 ? 'not_found' : 'ok', reference: FIXED_INCOME_REFERENCE, titles: chosen };
}

function outputOfBuilt(built: { payload: object; numbers: readonly number[]; keys: AskVeraToolOutput['keys'] }): AskVeraToolOutput {
    return { payload: jsonOf(built.payload), numbers: built.numbers, keys: built.keys };
}

function assetLookupOutput(input: unknown, locale: AppLocale): AskVeraToolOutput {
    const found: readonly LookupEntry[] = lookupOf(input);
    return found.length === 0 ? { payload: { status: 'no_match' } } : outputOfBuilt(buildAssetLookupContext(found, locale));
}

function fundPerformanceOutput(input: unknown, locale: AppLocale): AskVeraToolOutput {
    const known: boolean = fundPerformanceInputSchema.safeParse(input).data?.fundId === '11111111000191';
    const performance: FundPerformance = known ? FUND_FIXTURE : { ...FUND_FIXTURE, state: 'not_found', name: '', windows: {} };
    return outputOfBuilt(buildFundPerformanceContext(performance, ['m1', 'm3', 'm6', 'm12', 'm36'], locale));
}

function researchToolsOf(locale: AppLocale): readonly AskVeraTool[] {
    return [
        toolOf('asset_lookup', assetLookupInputSchema, locale, (input: unknown): AskVeraToolOutput => assetLookupOutput(input, locale)),
        toolOf('fund_performance', fundPerformanceInputSchema, locale, (input: unknown): AskVeraToolOutput =>
            fundPerformanceOutput(input, locale)
        ),
        toolOf('fixed_income_vs_benchmark', fixedIncomeBenchmarkInputSchema, locale, (input: unknown): AskVeraToolOutput =>
            outputOfBuilt(buildFixedIncomeBenchmarkContext(fixedIncomeOf(input), locale))
        )
    ];
}

export function appFixtureToolsOf(locale: AppLocale): readonly AskVeraTool[] {
    const concentration: ReturnType<typeof buildConcentrationContext> = buildConcentrationContext(CONCENTRATION_FIXTURE, locale);
    const maturities: ReturnType<typeof buildMaturitiesContext> = buildMaturitiesContext(MATURITIES_FIXTURE, '2027-03', locale);
    const benchmarks: ReturnType<typeof buildBenchmarksContext> = buildBenchmarksContext(BENCHMARKS_FIXTURE, undefined, locale);
    return [
        toolOf('concentration_overview', noInputSchema, locale, (): AskVeraToolOutput => outputOfBuilt(concentration)),
        toolOf('fixed_income_maturities', maturitiesInputSchema, locale, (): AskVeraToolOutput => outputOfBuilt(maturities)),
        toolOf('market_benchmarks', benchmarksInputSchema, locale, (): AskVeraToolOutput => outputOfBuilt(benchmarks)),
        ...researchToolsOf(locale),
        toolOf('portfolio_news', portfolioNewsInputSchema, locale, (input: unknown): AskVeraToolOutput =>
            portfolioNewsOutput(input, locale)
        )
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

async function outputOfCall(tool: AskVeraTool, input: unknown): Promise<AskVeraToolOutput> {
    return tool.run(tool.inputSchema.safeParse(input).data ?? input);
}

/** Saída das mockTools do caso com a entrada dele; as demais ferramentas entram com {} só como contexto. */
export async function evidenceOf(item: AskCase): Promise<string> {
    const tools: readonly AskVeraTool[] =
        item.task === 'ask_vera_app_step'
            ? [...fixtureToolsOf(item.locale), ...appFixtureToolsOf(item.locale)]
            : fixtureToolsOf(item.locale);
    const byName: ReadonlyMap<string, AskVeraTool> = new Map(tools.map((tool: AskVeraTool): [string, AskVeraTool] => [tool.name, tool]));
    const planned: ReadonlySet<string> = new Set(item.mockTools.map((call): string => call.name));
    const calls: { tool: AskVeraTool; input: unknown }[] = [
        ...item.mockTools.flatMap((call): { tool: AskVeraTool; input: unknown }[] => {
            const tool: AskVeraTool | undefined = byName.get(call.name);
            return tool === undefined ? [] : [{ tool, input: call.input }];
        }),
        ...tools.filter((tool: AskVeraTool): boolean => !planned.has(tool.name)).map((tool: AskVeraTool) => ({ tool, input: {} }))
    ];
    const outputs: AskVeraToolOutput[] = await Promise.all(
        calls.map((call): Promise<AskVeraToolOutput> => outputOfCall(call.tool, call.input))
    );
    const data: JsonObject[] = outputs.map((output: AskVeraToolOutput): JsonObject => output.payload);
    return JSON.stringify(item.task === 'ask_vera_app_step' ? [...data, ...helpEvidenceOf(item.locale)] : data);
}
