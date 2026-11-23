import { DetectorTransaction, MERCHANT_KEY_MIN_LENGTH } from './recurring.types';

const TRAILING_LOCATIONS: readonly string[] = [
    'BR',
    'BRA',
    'BRASIL',
    'US',
    'USA',
    'IE',
    'IRL',
    'NL',
    'GB',
    'LU',
    'SAO PAULO',
    'RIO DE JANEIRO',
    'BELO HORIZONTE',
    'PORTO ALEGRE',
    'CURITIBA',
    'BRASILIA',
    'SALVADOR',
    'FORTALEZA',
    'RECIFE',
    'CAMPINAS',
    'BARUERI',
    'OSASCO',
    'DUBLIN',
    'AMSTERDAM',
    'LUXEMBOURG',
    'LONDON'
];

function withoutTrailingLocation(text: string): string {
    const upper: string = text.toUpperCase();
    const location: string | undefined = TRAILING_LOCATIONS.find((candidate: string): boolean => upper.endsWith(` ${candidate}`));
    return location === undefined ? text : text.slice(0, text.length - location.length - 1);
}

export function cleanDescription(normalizedDescription: string): string | null {
    let cleaned: string = normalizedDescription
        .replace(/[0-9*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    let previous: string = '';
    while (previous !== cleaned) {
        previous = cleaned;
        cleaned = withoutTrailingLocation(cleaned).trim();
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
