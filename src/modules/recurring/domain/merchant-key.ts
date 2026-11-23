import { DetectorTransaction, MERCHANT_KEY_MIN_LENGTH } from './recurring.types';

const TRAILING_LOCATION: RegExp =
    /\s+(BRA?|BRASIL|USA?|IE|IRL|NL|GB|LU|SAO PAULO|RIO DE JANEIRO|BELO HORIZONTE|PORTO ALEGRE|CURITIBA|BRASILIA|SALVADOR|FORTALEZA|RECIFE|CAMPINAS|BARUERI|OSASCO|DUBLIN|AMSTERDAM|LUXEMBOURG|LONDON)$/i;

export function cleanDescription(normalizedDescription: string): string | null {
    let cleaned: string = normalizedDescription
        .replace(/[0-9*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    let previous: string = '';
    while (previous !== cleaned) {
        previous = cleaned;
        cleaned = cleaned.replace(TRAILING_LOCATION, '').trim();
    }
    return cleaned.length >= MERCHANT_KEY_MIN_LENGTH ? cleaned : null;
}

export function merchantKeyOf(transaction: DetectorTransaction): string | null {
    if (transaction.dictionaryPattern !== null) {
        return transaction.dictionaryPattern;
    }
    if (transaction.counterpartyKey !== null && transaction.counterpartyKey.length > 0) {
        return transaction.counterpartyKey;
    }
    return cleanDescription(transaction.normalizedDescription);
}
