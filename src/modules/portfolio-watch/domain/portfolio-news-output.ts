import { AppLocale } from '../../../shared/i18n/locale';
import type { AskVeraToolOutput } from '../../ai-assistant/services/ask-vera-tool.port';
import type { ClassSummary } from '../../portfolio/services/portfolio-snapshot.service';
import { ChangeItem } from './portfolio-changes.types';

export const NEWS_TOOL_MAX_ITEMS: number = 5;
const BPS_PER_PERCENT: number = 100;
const CUSTOM_KEY: RegExp = /^custom_(\d+)$/;
const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_LABELS: Readonly<Record<string, Readonly<Record<AppLocale, string>>>> = {
    result: { 'pt-BR': 'resultado', en: 'earnings' },
    income: { 'pt-BR': 'proventos', en: 'income' },
    relevant_fact: { 'pt-BR': 'fato relevante', en: 'material fact' },
    meeting: { 'pt-BR': 'assembleia', en: 'meeting' },
    management: { 'pt-BR': 'relatório gerencial', en: 'management report' },
    routine: { 'pt-BR': 'rotina', en: 'routine' }
};

const OTHER_KIND: Readonly<Record<AppLocale, string>> = { 'pt-BR': 'documento', en: 'document' };

export type ClassKeyResolution = { readonly found: true; readonly classId: string } | { readonly found: false };

export function classIdOfKey(classes: readonly ClassSummary[], key: string): ClassKeyResolution {
    if (UUID.test(key)) {
        return { found: true, classId: key };
    }
    const custom: number | null = CUSTOM_KEY.test(key) ? Number(CUSTOM_KEY.exec(key)?.[1]) : null;
    let seen: number = 0;
    for (const item of classes) {
        if (item.systemKey === null) {
            seen += 1;
        }
        if (item.systemKey === null ? custom === seen : item.systemKey === key) {
            return { found: true, classId: item.classId };
        }
    }
    return { found: false };
}

function weightText(weightBps: number, locale: AppLocale): string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
    return formatter.format(Math.round(weightBps / BPS_PER_PERCENT) / BPS_PER_PERCENT);
}

function dateText(isoDate: string, locale: AppLocale): string {
    const [year, month, day]: string[] = isoDate.split('-');
    return locale === 'pt-BR' ? `${day ?? ''}/${month ?? ''}/${year ?? ''}` : `${month ?? ''}/${day ?? ''}/${year ?? ''}`;
}

function entryOf(item: ChangeItem, locale: AppLocale): Record<string, string | null> {
    return {
        ativo: item.symbol,
        tipo: item.kind === null ? OTHER_KIND[locale] : (KIND_LABELS[item.kind]?.[locale] ?? OTHER_KIND[locale]),
        data: dateText(item.date, locale),
        resumo: item.summaryAvailable ? item.summary : null,
        peso: item.weightBps === null ? null : weightText(item.weightBps, locale)
    };
}

export function portfolioNewsOutputOf(
    items: readonly ChangeItem[],
    assetKey: string | undefined,
    days: number,
    locale: AppLocale
): AskVeraToolOutput {
    const wanted: string | undefined = assetKey?.toLowerCase();
    const shown: ChangeItem[] = items
        .filter((item: ChangeItem): boolean => wanted === undefined || item.symbol.toLowerCase() === wanted)
        .slice(0, NEWS_TOOL_MAX_ITEMS);
    if (shown.length === 0) {
        return { payload: { status: 'no_news', janela_dias: days } };
    }
    return { payload: { status: 'ok', janela_dias: days, itens: shown.map((item: ChangeItem) => entryOf(item, locale)) } };
}
