import type {
    FixedIncomeComparison,
    FixedIncomeReference,
    FixedIncomeTitleFigures
} from '../../../market-benchmarks/services/fixed-income-benchmark.service';
import type { FundPerformance, FundWindow, FundWindowReading } from '../../../market-benchmarks/services/fund-performance.service';
import type { LookupEntry } from '../../../market-benchmarks/services/asset-lookup.service';
import { BENCHMARK_WINDOW_MONTHS } from '../../../market-benchmarks/services/benchmark.service';
import { AppLocale } from '../../../../shared/i18n/locale';
import {
    AiAssetEntry,
    AiAssetLookupContext,
    AiFixedIncomeBenchmarkContext,
    AiFixedIncomeEntry,
    AiFixedIncomeStatus,
    AiFundPerformanceContext,
    AiFundStatus,
    AiFundWindowEntry,
    BuiltContext
} from './ai-context.types';
import { WINDOW_LABELS, citeDate, citeSource } from './benchmarks.context';
import { ContextFacts } from './context-facts';
import { defaultClassLabel } from './default-labels';

const MONTH_CHARS: number = 7;

type Labels = Readonly<Record<string, Readonly<Record<AppLocale, string>>>>;

const KIND_LABELS: Labels = {
    stock: { 'pt-BR': 'Ação', en: 'Stock' },
    etf: { 'pt-BR': 'ETF', en: 'ETF' },
    fii: { 'pt-BR': 'FII', en: 'REIT (FII)' },
    bdr: { 'pt-BR': 'BDR', en: 'BDR' },
    reit: { 'pt-BR': 'REIT', en: 'REIT' },
    crypto: { 'pt-BR': 'Cripto', en: 'Crypto' },
    treasury: { 'pt-BR': 'Tesouro Direto', en: 'Brazilian Treasury bond' },
    fund: { 'pt-BR': 'Fundo', en: 'Fund' }
};

const MARKET_LABELS: Labels = {
    B3: { 'pt-BR': 'B3 (Brasil)', en: 'B3 (Brazil)' },
    US: { 'pt-BR': 'Estados Unidos', en: 'United States' },
    CRYPTO: { 'pt-BR': 'Cripto', en: 'Crypto' },
    TESOURO: { 'pt-BR': 'Tesouro Direto', en: 'Brazilian Treasury' },
    CVM: { 'pt-BR': 'Fundos (CVM)', en: 'Funds (CVM)' }
};

const INDEXER_LABELS: Labels = {
    cdi_percent: { 'pt-BR': 'percentual do CDI', en: 'percentage of the CDI' },
    prefixed: { 'pt-BR': 'prefixado', en: 'fixed rate' },
    ipca_plus: { 'pt-BR': 'IPCA mais taxa', en: 'inflation plus rate' }
};

const FUND_STATUS: Readonly<Record<string, AiFundStatus>> = {
    ok: 'ok',
    not_found: 'fundo_nao_encontrado',
    no_data: 'sem_dados'
};

const FIXED_INCOME_STATUS: Readonly<Record<string, AiFixedIncomeStatus>> = {
    ok: 'ok',
    list: 'escolha_um_titulo',
    not_found: 'titulo_nao_encontrado',
    no_titles: 'sem_titulos',
    no_index: 'sem_indice'
};

function labelOf(labels: Labels, key: string, locale: AppLocale): string {
    return labels[key]?.[locale] ?? key;
}

function assetEntry(entry: LookupEntry, facts: ContextFacts, locale: AppLocale): AiAssetEntry {
    const base: Omit<AiAssetEntry, 'fund_id'> = {
        nome: entry.name,
        ticker: entry.symbol,
        tipo: labelOf(KIND_LABELS, entry.kind, locale),
        classe: defaultClassLabel(entry.suggestedClassKey, locale),
        mercado: labelOf(MARKET_LABELS, entry.market, locale),
        cotacao:
            entry.quote === null
                ? null
                : { valor: facts.price(entry.quote.price, entry.quote.currency), data: entry.quote.date, atrasada: entry.quote.stale }
    };
    if (entry.quote !== null) {
        citeDate(entry.quote.date, facts);
    }
    return entry.kind === 'fund' ? { ...base, fund_id: entry.externalId } : base;
}

export function buildAssetLookupContext(entries: readonly LookupEntry[], locale: AppLocale): BuiltContext<AiAssetLookupContext> {
    const facts: ContextFacts = new ContextFacts(locale, 'BRL');
    const payload: AiAssetLookupContext = { ativos: entries.map((entry: LookupEntry): AiAssetEntry => assetEntry(entry, facts, locale)) };
    return { payload, numbers: facts.numbers(), keys: new Map() };
}

function situationOf(differenceBps: number | null): AiFundWindowEntry['situacao'] {
    if (differenceBps === null) {
        return null;
    }
    if (differenceBps === 0) {
        return 'igual_ao_cdi';
    }
    return differenceBps > 0 ? 'acima_do_cdi' : 'abaixo_do_cdi';
}

function fundWindowEntry(key: FundWindow, reading: FundWindowReading, facts: ContextFacts, locale: AppLocale): AiFundWindowEntry {
    facts.count(BENCHMARK_WINDOW_MONTHS[key]);
    return {
        periodo: WINDOW_LABELS[key][locale],
        fundo: facts.rate(reading.fundBps),
        cdi: reading.cdiBps === null ? null : facts.rate(reading.cdiBps),
        diferenca: reading.differenceBps === null ? null : facts.points(reading.differenceBps),
        situacao: situationOf(reading.differenceBps)
    };
}

function fundWindowsOf(
    performance: FundPerformance,
    shown: readonly FundWindow[],
    facts: ContextFacts,
    locale: AppLocale
): AiFundWindowEntry[] {
    return shown.flatMap((key: FundWindow): AiFundWindowEntry[] => {
        const reading: FundWindowReading | undefined = performance.windows[key];
        return reading === undefined ? [] : [fundWindowEntry(key, reading, facts, locale)];
    });
}

function missingOf(performance: FundPerformance, facts: ContextFacts, locale: AppLocale): string[] {
    return performance.missing.map((key: FundWindow): string => {
        facts.count(BENCHMARK_WINDOW_MONTHS[key]);
        return WINDOW_LABELS[key][locale];
    });
}

export function buildFundPerformanceContext(
    performance: FundPerformance,
    shown: readonly FundWindow[],
    locale: AppLocale
): BuiltContext<AiFundPerformanceContext> {
    const facts: ContextFacts = new ContextFacts(locale, 'BRL');
    citeDate(performance.lastDate, facts);
    citeDate(performance.cdiLastDate, facts);
    citeSource(performance.cdiSource, facts);
    const payload: AiFundPerformanceContext = {
        status: FUND_STATUS[performance.state] ?? 'sem_dados',
        fundo: performance.name,
        fonte: performance.source,
        ate: performance.lastDate,
        atrasado: performance.stale,
        cdi_fonte: performance.cdiSource,
        cdi_ate: performance.cdiLastDate,
        historico_completo: performance.complete,
        janelas: fundWindowsOf(performance, shown, facts, locale),
        sem_historico: missingOf(performance, facts, locale)
    };
    return { payload, numbers: facts.numbers(), keys: new Map() };
}

function situationVersusCdi(bps: number | null): AiFixedIncomeEntry['situacao_contra_cdi'] {
    if (bps === null) {
        return null;
    }
    if (bps === 0) {
        return 'igual';
    }
    return bps > 0 ? 'acima' : 'abaixo';
}

function titleEntry(title: FixedIncomeTitleFigures, facts: ContextFacts, locale: AppLocale): AiFixedIncomeEntry {
    return {
        chave: title.key,
        tipo: title.kind,
        indexador: labelOf(INDEXER_LABELS, title.indexer, locale),
        taxa_contratada: facts.rate(title.rateBps),
        aplicado_em: title.appliedAt.slice(0, 7),
        taxa_nominal_estimada: title.nominalAnnualBps === null ? null : facts.rate(title.nominalAnnualBps),
        taxa_real_estimada: title.realAnnualBps === null ? null : facts.rate(title.realAnnualBps),
        ganha_da_inflacao: title.beatsInflation,
        contra_cdi_12m: title.versusCdiBps === null ? null : facts.points(title.versusCdiBps),
        situacao_contra_cdi: situationVersusCdi(title.versusCdiBps),
        estimado: title.estimated
    };
}

function referenceOf(
    bps: number | null,
    source: string,
    lastDate: string | null,
    facts: ContextFacts
): AiFixedIncomeBenchmarkContext['cdi_12m'] {
    citeDate(lastDate, facts);
    citeSource(source, facts);
    return { valor: bps === null ? null : facts.rate(bps), fonte: source, ate: lastDate };
}

export function buildFixedIncomeBenchmarkContext(
    comparison: FixedIncomeComparison,
    locale: AppLocale
): BuiltContext<AiFixedIncomeBenchmarkContext> {
    const facts: ContextFacts = new ContextFacts(locale, 'BRL');
    const reference: FixedIncomeReference = comparison.reference;
    facts.count(BENCHMARK_WINDOW_MONTHS.m12);
    const payload: AiFixedIncomeBenchmarkContext = {
        status: FIXED_INCOME_STATUS[comparison.state] ?? 'sem_indice',
        cdi_12m: referenceOf(reference.cdi12Bps, reference.cdiSource, reference.cdiLastDate, facts),
        ipca_12m: referenceOf(reference.ipca12Bps, reference.ipcaSource, reference.ipcaLastDate?.slice(0, MONTH_CHARS) ?? null, facts),
        titulos: comparison.titles.map((title: FixedIncomeTitleFigures): AiFixedIncomeEntry => titleEntry(title, facts, locale))
    };
    return { payload, numbers: facts.numbers(), keys: new Map() };
}
