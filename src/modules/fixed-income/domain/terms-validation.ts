import { addDays } from './curve/business-days';
import { CURRENCIES, Indexer, INDEXERS } from './curve/curve.types';
import { AppliedDateOutOfRangeError, InvalidTermsError } from './fixed-income.errors';
import { MAX_TERM_YEARS, MIN_APPLIED_DATE, RATE_RANGE_BPS, TitleTerms } from './fixed-income.types';

const DAYS_PER_YEAR: number = 365;
const LEAP_DAYS_BUFFER_PER_FOUR_YEARS: number = 1;

export function isRateWithinRange(indexer: Indexer, rateBps: number): boolean {
    return rateBps >= RATE_RANGE_BPS[indexer].min && rateBps <= RATE_RANGE_BPS[indexer].max;
}

function latestMaturity(appliedAt: string): string {
    const leapDays: number = Math.ceil(MAX_TERM_YEARS / 4) * LEAP_DAYS_BUFFER_PER_FOUR_YEARS;
    return addDays(appliedAt, MAX_TERM_YEARS * DAYS_PER_YEAR + leapDays);
}

export function assertValidTerms(terms: TitleTerms, today: string): void {
    if (terms.appliedAt < MIN_APPLIED_DATE || terms.appliedAt > today) {
        throw new AppliedDateOutOfRangeError(MIN_APPLIED_DATE);
    }
    if (terms.maturityDate <= terms.appliedAt) {
        throw new InvalidTermsError('maturity_not_after_application');
    }
    if (terms.maturityDate > latestMaturity(terms.appliedAt)) {
        throw new InvalidTermsError('term_too_long');
    }
    if (terms.currency === CURRENCIES.usd && terms.indexer !== INDEXERS.prefixed) {
        throw new InvalidTermsError('usd_requires_prefixed');
    }
    if (!isRateWithinRange(terms.indexer, terms.rateBps)) {
        throw new InvalidTermsError('rate_out_of_range');
    }
}
