import type { MaturityItem } from '../../../fixed-income-schedule/services/maturities-reader.service';
import { AppLocale } from '../../../../shared/i18n/locale';
import { AiMaturitiesContext, AiMaturityEntry, AiMaturityKindEntry, BuiltContext } from './ai-context.types';
import { ContextFacts } from './context-facts';

export const MATURITIES_CURRENCY: string = 'BRL';
const TREASURY_KIND: string = 'tesouro';
const MONTH_CHARS: number = 7;

interface Bucket {
    readonly months: Map<string, number>;
    totalMinor: number;
}

function kindOf(item: MaturityItem): string {
    return item.kind ?? TREASURY_KIND;
}

function bucketsOf(items: readonly MaturityItem[]): Map<string, Bucket> {
    const buckets: Map<string, Bucket> = new Map<string, Bucket>();
    for (const item of items) {
        const bucket: Bucket = buckets.get(kindOf(item)) ?? { months: new Map<string, number>(), totalMinor: 0 };
        const month: string = item.maturityDate.slice(0, MONTH_CHARS);
        bucket.months.set(month, (bucket.months.get(month) ?? 0) + item.estimatedValueMinor);
        bucket.totalMinor += item.estimatedValueMinor;
        buckets.set(kindOf(item), bucket);
    }
    return buckets;
}

function kindEntry(kind: string, bucket: Bucket, facts: ContextFacts): AiMaturityKindEntry {
    const vencimentos: AiMaturityEntry[] = [...bucket.months.entries()]
        .sort(([left]: [string, number], [right]: [string, number]): number => left.localeCompare(right))
        .map(([mes, minor]: [string, number]): AiMaturityEntry => ({ mes, valor: facts.money(minor) }));
    return { tipo: kind, total: facts.money(bucket.totalMinor), vencimentos };
}

export function buildMaturitiesContext(
    items: readonly MaturityItem[],
    untilMonth: string,
    locale: AppLocale
): BuiltContext<AiMaturitiesContext> {
    const facts: ContextFacts = new ContextFacts(locale, MATURITIES_CURRENCY);
    const buckets: Map<string, Bucket> = bucketsOf(items);
    const payload: AiMaturitiesContext = {
        moeda_base: MATURITIES_CURRENCY,
        ate: untilMonth,
        total: facts.money(items.reduce((sum: number, item: MaturityItem): number => sum + item.estimatedValueMinor, 0)),
        estimado: items.some((item: MaturityItem): boolean => item.estimated),
        por_tipo: [...buckets.entries()]
            .sort(([left]: [string, Bucket], [right]: [string, Bucket]): number => left.localeCompare(right))
            .map(([kind, bucket]: [string, Bucket]): AiMaturityKindEntry => kindEntry(kind, bucket, facts))
    };
    return { payload, numbers: facts.numbers(), keys: new Map() };
}
