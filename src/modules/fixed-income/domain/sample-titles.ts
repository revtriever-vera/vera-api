import { AppLocale } from '../../../shared/i18n/locale';
import { addDays } from './curve/business-days';
import { CURRENCIES, INDEXERS, Indexer } from './curve/curve.types';
import { TitleDraft } from './fixed-income-title.domain';
import { TITLE_KINDS, TitleKind } from './fixed-income.types';

const YEAR_IN_DAYS: number = 365;
/** Matures inside the "soon" window of the overview, so the sample account shows the maturity alert. */
const SOON_MATURITY_DAYS: number = 45;

interface SampleTitleSpec {
    readonly kind: TitleKind;
    readonly names: Readonly<Record<AppLocale, string>>;
    readonly issuerId: string;
    readonly indexer: Indexer;
    readonly rateBps: number;
    readonly appliedMinor: number;
    readonly appliedDaysAgo: number;
    readonly maturityDaysAhead: number;
}

/**
 * Sofisa matures soon, and BTG Pactual plus Pan (one prudential conglomerate) sum R$ 300 mil, above the
 * R$ 250 mil FGC limit: the sample account reproduces both overview alerts of the prototype.
 */
const SAMPLE_TITLE_SPECS: readonly SampleTitleSpec[] = [
    {
        kind: TITLE_KINDS.cdb,
        names: { 'pt-BR': 'CDB Exemplo 110% CDI', en: 'Sample CDB 110% CDI' },
        issuerId: 'banco-sofisa',
        indexer: INDEXERS.cdiPercent,
        rateBps: 11000,
        appliedMinor: 2_500_000,
        appliedDaysAgo: YEAR_IN_DAYS,
        maturityDaysAhead: SOON_MATURITY_DAYS
    },
    {
        kind: TITLE_KINDS.lci,
        names: { 'pt-BR': 'LCI Exemplo Pré 11,5%', en: 'Sample LCI Fixed 11.5%' },
        issuerId: 'btg-pactual',
        indexer: INDEXERS.prefixed,
        rateBps: 1150,
        appliedMinor: 18_000_000,
        appliedDaysAgo: 180,
        maturityDaysAhead: 3 * YEAR_IN_DAYS
    },
    {
        kind: TITLE_KINDS.cdb,
        names: { 'pt-BR': 'CDB Exemplo IPCA+6%', en: 'Sample CDB IPCA+6%' },
        issuerId: 'banco-pan',
        indexer: INDEXERS.ipcaPlus,
        rateBps: 600,
        appliedMinor: 12_000_000,
        appliedDaysAgo: 2 * YEAR_IN_DAYS,
        maturityDaysAhead: 5 * YEAR_IN_DAYS
    }
];

export function sampleTitleDrafts(today: string, locale: AppLocale): TitleDraft[] {
    return SAMPLE_TITLE_SPECS.map((spec: SampleTitleSpec): TitleDraft => ({
        kind: spec.kind,
        name: spec.names[locale],
        issuerId: spec.issuerId,
        indexer: spec.indexer,
        rateBps: spec.rateBps,
        currency: CURRENCIES.brl,
        appliedMinor: spec.appliedMinor,
        appliedAt: addDays(today, -spec.appliedDaysAgo),
        maturityDate: addDays(today, spec.maturityDaysAhead),
        holderUserId: null
    }));
}
