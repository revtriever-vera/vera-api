import { AppLocale } from '../../../../shared/i18n/locale';
import {
    AiMonthlyReviewContext,
    AiReviewClassEntry,
    AiReviewConcentration,
    AiReviewIndices,
    AiReviewMoveEntry,
    BuiltContext,
    ReviewClassLabel,
    ReviewSource
} from './ai-context.types';
import { ContextFacts } from './context-facts';
import { ContextKeys } from './context-keys';
import { defaultClassLabel } from './default-labels';

const BPS_PER_PERCENT: number = 100;

type ReviewClass = ReviewSource['byClass'][number];
type ReviewMove = ReviewSource['topGainers'][number];
type ReviewBenchmark = ReviewSource['benchmarks']['cdi'];

function bpsOf(percent: number): number {
    return Math.round(percent * BPS_PER_PERCENT);
}

function rateOrNull(percent: number | undefined, facts: ContextFacts): string | null {
    return percent === undefined ? null : facts.signedRate(bpsOf(percent));
}

function classEntries(
    review: ReviewSource,
    labels: readonly ReviewClassLabel[],
    keys: ContextKeys,
    facts: ContextFacts,
    locale: AppLocale
): AiReviewClassEntry[] {
    const byId: ReadonlyMap<string, ReviewClassLabel> = new Map(
        labels.map((label: ReviewClassLabel): [string, ReviewClassLabel] => [label.classId, label])
    );
    return review.byClass.flatMap((item: ReviewClass): AiReviewClassEntry[] => {
        const label: ReviewClassLabel | undefined = item.classId === null ? undefined : byId.get(item.classId);
        if (label === undefined) {
            return [];
        }
        const assigned: ReturnType<ContextKeys['assign']> = keys.assign({
            kind: 'cls',
            systemKey: label.systemKey,
            realName: label.displayName,
            defaultLabel: defaultClassLabel(label.systemKey, locale)
        });
        return [{ ...assigned, rentabilidade_pct: rateOrNull(item.returnPct, facts) }];
    });
}

function moveEntries(moves: readonly ReviewMove[], keys: ContextKeys, facts: ContextFacts): AiReviewMoveEntry[] {
    return moves.map((move: ReviewMove): AiReviewMoveEntry => ({
        chave: keys.assign({ kind: 'ativo', systemKey: null, realName: move.symbol, defaultLabel: null }).chave,
        variacao_pct: facts.signedRate(bpsOf(move.variationPct))
    }));
}

function benchmarkOf(benchmark: ReviewBenchmark, facts: ContextFacts): string | null {
    return benchmark.state === 'ok' && benchmark.returnPct !== null ? facts.signedRate(bpsOf(benchmark.returnPct)) : null;
}

function indicesOf(review: ReviewSource, facts: ContextFacts): AiReviewIndices {
    return {
        cdi_pct: benchmarkOf(review.benchmarks.cdi, facts),
        ipca_pct: benchmarkOf(review.benchmarks.ipca, facts),
        ibovespa_pct: benchmarkOf(review.benchmarks.ibovespa, facts)
    };
}

function incomeShare(review: ReviewSource, facts: ContextFacts): string | null {
    const total: number = review.byClass.reduce((sum: number, item: ReviewClass): number => sum + item.endMinor, 0);
    if (review.income.amountMinor <= 0 || total <= 0) {
        return null;
    }
    return facts.rate(Math.round((review.income.amountMinor / total) * BPS_PER_PERCENT * BPS_PER_PERCENT));
}

function concentrationOf(review: ReviewSource, facts: ContextFacts): AiReviewConcentration {
    const issuer: ReviewSource['concentration']['topIssuers'][number] | undefined = review.concentration.topIssuers.find(
        (row: ReviewSource['concentration']['topIssuers'][number]): boolean => row.name !== null
    );
    const sectorBps: number = Math.max(0, ...review.concentration.sectors.map((row): number => row.shareBps));
    return {
        maior_emissor_pct: issuer === undefined ? null : facts.percent(issuer.shareBps),
        maior_setor_pct: sectorBps === 0 ? null : facts.percent(sectorBps),
        acima_do_fgc: review.concentration.fgcExposure.overLimitMinor > 0
    };
}

export function buildMonthlyReviewContext(
    review: ReviewSource,
    labels: readonly ReviewClassLabel[],
    locale: AppLocale
): BuiltContext<AiMonthlyReviewContext> {
    const facts: ContextFacts = new ContextFacts(locale, review.baseCurrency);
    const keys: ContextKeys = new ContextKeys();
    const payload: AiMonthlyReviewContext = {
        mes: review.month,
        rentabilidade_pct: rateOrNull(review.returnPct, facts),
        sem_rentabilidade_motivo: review.coverage.reason,
        por_classe: classEntries(review, labels, keys, facts, locale),
        indices: indicesOf(review, facts),
        maiores_altas: moveEntries(review.topGainers, keys, facts),
        maiores_quedas: moveEntries(review.topLosers, keys, facts),
        proventos_pct_carteira: incomeShare(review, facts),
        concentracao: concentrationOf(review, facts)
    };
    return { payload, numbers: facts.numbers(), keys: keys.all() };
}
