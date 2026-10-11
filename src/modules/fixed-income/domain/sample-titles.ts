import { AppLocale } from '../../../shared/i18n/locale';
import { addDays } from './curve/business-days';
import { CURRENCIES, INDEXERS, Indexer } from './curve/curve.types';
import { TitleDraft } from './fixed-income-title.domain';
import { TITLE_KINDS, TitleKind } from './fixed-income.types';

const YEAR_IN_DAYS: number = 365;

interface SampleTitleSpec {
    readonly kind: TitleKind;
    readonly names: Readonly<Record<AppLocale, string>>;
    readonly indexer: Indexer;
    readonly rateBps: number;
    readonly appliedMinor: number;
    readonly appliedDaysAgo: number;
    readonly maturityDaysAhead: number;
}

const SAMPLE_TITLE_SPECS: readonly SampleTitleSpec[] = [
    {
        kind: TITLE_KINDS.cdb,
        names: { 'pt-BR': 'CDB Exemplo 110% CDI', en: 'Sample CDB 110% CDI' },
        indexer: INDEXERS.cdiPercent,
        rateBps: 11000,
        appliedMinor: 2_500_000,
        appliedDaysAgo: YEAR_IN_DAYS,
        maturityDaysAhead: 2 * YEAR_IN_DAYS
    },
    {
        kind: TITLE_KINDS.lci,
        names: { 'pt-BR': 'LCI Exemplo Pré 11,5%', en: 'Sample LCI Fixed 11.5%' },
        indexer: INDEXERS.prefixed,
        rateBps: 1150,
        appliedMinor: 1_800_000,
        appliedDaysAgo: 180,
        maturityDaysAhead: 3 * YEAR_IN_DAYS
    },
    {
        kind: TITLE_KINDS.debenture,
        names: { 'pt-BR': 'Debênture Exemplo IPCA+6%', en: 'Sample Debenture IPCA+6%' },
        indexer: INDEXERS.ipcaPlus,
        rateBps: 600,
        appliedMinor: 3_000_000,
        appliedDaysAgo: 2 * YEAR_IN_DAYS,
        maturityDaysAhead: 5 * YEAR_IN_DAYS
    }
];

export function sampleTitleDrafts(today: string, locale: AppLocale): TitleDraft[] {
    return SAMPLE_TITLE_SPECS.map((spec: SampleTitleSpec): TitleDraft => ({
        kind: spec.kind,
        name: spec.names[locale],
        indexer: spec.indexer,
        rateBps: spec.rateBps,
        currency: CURRENCIES.brl,
        appliedMinor: spec.appliedMinor,
        appliedAt: addDays(today, -spec.appliedDaysAgo),
        maturityDate: addDays(today, spec.maturityDaysAhead)
    }));
}
