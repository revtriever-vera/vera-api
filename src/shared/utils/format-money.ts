import { AppLocale } from '../i18n/locale';

const CURRENCY: string = 'BRL';
const MINOR_UNITS: number = 100;
const FORMATTERS: Map<AppLocale, Intl.NumberFormat> = new Map<AppLocale, Intl.NumberFormat>();

function formatterFor(locale: AppLocale): Intl.NumberFormat {
    const cached: Intl.NumberFormat | undefined = FORMATTERS.get(locale);
    if (cached !== undefined) {
        return cached;
    }
    const created: Intl.NumberFormat = new Intl.NumberFormat(locale, { style: 'currency', currency: CURRENCY });
    FORMATTERS.set(locale, created);
    return created;
}

export function formatMoney(amountMinor: number, locale: AppLocale): string {
    return formatterFor(locale).format(amountMinor / MINOR_UNITS);
}
