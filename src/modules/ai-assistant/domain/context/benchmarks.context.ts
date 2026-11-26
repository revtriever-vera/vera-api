import { AppLocale } from '../../../../shared/i18n/locale';
import {
    BENCHMARK_WINDOWS,
    BENCHMARK_WINDOW_MONTHS,
    BenchmarkWindow,
    BenchmarkWindows,
    IBOVESPA_STATES,
    IbovespaState,
    SelicTargetReading,
    WindowedReading
} from '../../../market-benchmarks/services/benchmark.service';
import { AiBenchmarkPeriod, AiBenchmarksContext, AiBenchmarkSeries, AiIbovespaStatus, BuiltContext } from './ai-context.types';
import { ContextFacts } from './context-facts';

const DATE_DAY_START: number = 8;
const DATE_MONTH_START: number = 5;
const DATE_YEAR_END: number = 4;
const MONTH_KEY_LENGTH: number = 7;

export const WINDOW_LABELS: Readonly<Record<BenchmarkWindow, Readonly<Record<AppLocale, string>>>> = {
    m1: { 'pt-BR': '1 mês', en: '1 month' },
    m3: { 'pt-BR': '3 meses', en: '3 months' },
    m6: { 'pt-BR': '6 meses', en: '6 months' },
    m12: { 'pt-BR': '12 meses', en: '12 months' },
    m24: { 'pt-BR': '24 meses', en: '24 months' },
    m36: { 'pt-BR': '36 meses', en: '36 months' },
    ytd: { 'pt-BR': 'no ano', en: 'year to date' }
};

const IBOVESPA_STATUS: Readonly<Record<IbovespaState, AiIbovespaStatus>> = {
    [IBOVESPA_STATES.ok]: 'ok',
    [IBOVESPA_STATES.notConfigured]: 'nao_configurado',
    [IBOVESPA_STATES.noData]: 'sem_dados'
};

export function citeDate(date: string | null, facts: ContextFacts): void {
    if (date === null) {
        return;
    }
    facts.count(Number(date.slice(0, DATE_YEAR_END)));
    facts.count(Number(date.slice(DATE_MONTH_START, DATE_MONTH_START + 2)));
    if (date.length > MONTH_KEY_LENGTH) {
        facts.count(Number(date.slice(DATE_DAY_START, DATE_DAY_START + 2)));
    }
}

const SERIES_NUMBER: RegExp = /\d+/;

export function citeSource(source: string, facts: ContextFacts): void {
    const code: string | undefined = SERIES_NUMBER.exec(source)?.[0];
    if (code !== undefined) {
        facts.count(Number(code));
    }
}

function dateShown(date: string | null, monthly: boolean): string | null {
    if (date === null) {
        return null;
    }
    return monthly ? date.slice(0, MONTH_KEY_LENGTH) : date;
}

function seriesOf(
    reading: WindowedReading,
    shown: readonly BenchmarkWindow[],
    facts: ContextFacts,
    locale: AppLocale,
    monthly: boolean
): AiBenchmarkSeries {
    const acumulado: AiBenchmarkPeriod[] = [];
    const semHistorico: string[] = [];
    for (const key of shown) {
        const bps: number | null = reading.windows[key];
        if (bps === null) {
            semHistorico.push(WINDOW_LABELS[key][locale]);
            continue;
        }
        if (key !== 'ytd') {
            facts.count(BENCHMARK_WINDOW_MONTHS[key]);
        }
        acumulado.push({ periodo: WINDOW_LABELS[key][locale], valor: facts.rate(bps) });
    }
    const ate: string | null = dateShown(reading.lastDate, monthly);
    citeDate(ate, facts);
    citeSource(reading.source, facts);
    return { fonte: reading.source, ate, atrasado: reading.stale, acumulado, sem_historico: semHistorico };
}

function selicOf(reading: SelicTargetReading, facts: ContextFacts): AiBenchmarksContext['selic_meta'] {
    citeDate(reading.lastDate, facts);
    citeSource(reading.source, facts);
    return {
        fonte: reading.source,
        ate: reading.lastDate,
        atrasado: reading.stale,
        valor: reading.bps === null ? null : facts.rate(reading.bps)
    };
}

export function buildBenchmarksContext(
    windows: BenchmarkWindows,
    shown: readonly BenchmarkWindow[] | undefined,
    locale: AppLocale
): BuiltContext<AiBenchmarksContext> {
    const facts: ContextFacts = new ContextFacts(locale, 'BRL');
    const keys: readonly BenchmarkWindow[] = shown ?? BENCHMARK_WINDOWS;
    citeDate(windows.asOf, facts);
    const payload: AiBenchmarksContext = {
        referencia: windows.asOf,
        cdi: seriesOf(windows.cdi, keys, facts, locale, false),
        ipca: seriesOf(windows.ipca, keys, facts, locale, true),
        selic_meta: selicOf(windows.selicTarget, facts),
        ibovespa: {
            ...seriesOf(windows.ibovespa, keys, facts, locale, false),
            status: IBOVESPA_STATUS[windows.ibovespa.state]
        }
    };
    return { payload, numbers: facts.numbers(), keys: new Map() };
}
