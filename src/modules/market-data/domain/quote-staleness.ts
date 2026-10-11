import { DateUtil } from '../../../shared/utils/date.util';
import { QUOTE_MARKETS, QuoteMarket } from './market-data.types';

export const STALE_AFTER_DAYS: Readonly<Record<QuoteMarket, number>> = {
    B3: 4,
    US: 4,
    TESOURO: 4,
    CRYPTO: 2
};

const DAY_MS: number = 86_400_000;
const SUNDAY: number = 0;
const SATURDAY: number = 6;
const US_TIMEZONE: string = 'America/New_York';
const UTC_TIMEZONE: string = 'UTC';

function dayNumber(isoDate: string): number {
    return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

function isoOfDayNumber(day: number): string {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function isWeekend(isoDate: string): boolean {
    const weekday: number = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
    return weekday === SUNDAY || weekday === SATURDAY;
}

function lastWeekdayOnOrBefore(isoDate: string): string {
    let day: number = dayNumber(isoDate);
    while (isWeekend(isoOfDayNumber(day))) {
        day -= 1;
    }
    return isoOfDayNumber(day);
}

export function ageInDays(priceDate: string, today: string): number {
    return dayNumber(today) - dayNumber(priceDate);
}

export function isQuoteStale(priceDate: string, market: QuoteMarket, today: string): boolean {
    return ageInDays(priceDate, today) > STALE_AFTER_DAYS[market];
}

export function expectedPriceDate(market: QuoteMarket, now: Date): string {
    if (market === QUOTE_MARKETS.crypto) {
        return DateUtil.localDateIn(UTC_TIMEZONE, now);
    }
    if (market === QUOTE_MARKETS.us) {
        return lastWeekdayOnOrBefore(DateUtil.localDateIn(US_TIMEZONE, now));
    }
    return lastWeekdayOnOrBefore(DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, now));
}
