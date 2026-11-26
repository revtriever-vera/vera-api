import { AppLocale } from '../../../shared/i18n/locale';
import { DateUtil } from '../../../shared/utils/date.util';
import type { PublicDocumentView } from '../../market-documents/services/market-documents-reader.service';
import { ChangeItem, HeldAsset, MAX_CHANGES_ITEMS } from './portfolio-changes.types';

const COPY: Readonly<
    Record<AppLocale, { readonly unavailable: string; readonly under: string; readonly line: (symbol: string, share: string) => string }>
> = {
    'pt-BR': {
        unavailable: 'Resumo indisponível',
        under: 'menos de 0,1%',
        line: (symbol: string, share: string): string => `${symbol} é ${share} da sua carteira.`
    },
    en: {
        unavailable: 'Summary unavailable',
        under: 'less than 0.1%',
        line: (symbol: string, share: string): string => `${symbol} is ${share} of your portfolio.`
    }
};

const MIN_VISIBLE_BPS: number = 10;
const BPS_IN_ONE: number = 10_000;

export function weightLineOf(symbol: string, weightBps: number | null, locale: AppLocale): string | null {
    if (weightBps === null) {
        return null;
    }
    const copy: (typeof COPY)[AppLocale] = COPY[locale];
    if (weightBps < MIN_VISIBLE_BPS) {
        return copy.line(symbol, copy.under);
    }
    const share: string = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(weightBps / BPS_IN_ONE);
    return copy.line(symbol, share);
}

function heaviestOf(document: PublicDocumentView, held: ReadonlyMap<string, HeldAsset>): HeldAsset | null {
    let chosen: HeldAsset | null = null;
    for (const assetId of document.assetIds) {
        const candidate: HeldAsset | undefined = held.get(assetId);
        if (candidate !== undefined && (chosen === null || (candidate.weightBps ?? 0) > (chosen.weightBps ?? 0))) {
            chosen = candidate;
        }
    }
    return chosen;
}

function itemOf(document: PublicDocumentView, asset: HeldAsset, locale: AppLocale): ChangeItem {
    return {
        id: document.id,
        assetId: asset.assetId,
        symbol: asset.symbol,
        source: document.source,
        category: document.category,
        title: document.title,
        kind: document.summary?.kind ?? null,
        date: DateUtil.onlyDateString(document.publishedAt),
        summary: document.summary?.text ?? COPY[locale].unavailable,
        summaryAvailable: document.summary !== null,
        relevance: document.summary?.relevance ?? null,
        weightBps: asset.weightBps,
        weightLine: weightLineOf(asset.symbol, asset.weightBps, locale),
        documentUrl: document.url
    };
}

function scoreOf(item: ChangeItem): number {
    return (item.relevance ?? 0) * (item.weightBps ?? 0);
}

export function byChangeOrder(left: ChangeItem, right: ChangeItem): number {
    return scoreOf(right) - scoreOf(left) || right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
}

export function changeItemsOf(
    documents: readonly PublicDocumentView[],
    held: ReadonlyMap<string, HeldAsset>,
    locale: AppLocale
): ChangeItem[] {
    const items: ChangeItem[] = [];
    for (const document of documents) {
        const asset: HeldAsset | null = heaviestOf(document, held);
        if (asset !== null) {
            items.push(itemOf(document, asset, locale));
        }
    }
    return items.sort(byChangeOrder);
}

export function limitedChanges(items: readonly ChangeItem[]): ChangeItem[] {
    return items.slice(0, MAX_CHANGES_ITEMS);
}
