import { AppLocale } from '../../../../shared/i18n/locale';

const NO_BREAK_SPACE: string = String.fromCodePoint(0xa0);
const NARROW_NO_BREAK_SPACE: string = String.fromCodePoint(0x202f);
const MINOR_PER_MAJOR: number = 100;
const BPS_PER_PERCENT: number = 100;

function plain(text: string): string {
    return text.replaceAll(NO_BREAK_SPACE, ' ').replaceAll(NARROW_NO_BREAK_SPACE, ' ');
}

export function moneyText(minor: number, currency: string, locale: AppLocale): string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
    return plain(formatter.format(Math.round(minor / MINOR_PER_MAJOR)));
}

export function percentText(bps: number, locale: AppLocale): string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
    return plain(formatter.format(Math.round(bps / BPS_PER_PERCENT) / BPS_PER_PERCENT));
}

export function signedPercentText(bps: number, locale: AppLocale): string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 0,
        signDisplay: 'exceptZero'
    });
    return plain(formatter.format(Math.round(bps / BPS_PER_PERCENT) / BPS_PER_PERCENT));
}

export function pointsText(bps: number, locale: AppLocale): string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    return `${formatter.format(bps / BPS_PER_PERCENT)} pp`;
}
