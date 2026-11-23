import { Charge } from './charge';
import { CADENCES } from './recurring.types';

function isPersonPix(charge: Charge): boolean {
    const transaction: Charge['transaction'] = charge.transaction;
    const hasCounterparty: boolean = transaction.counterpartyKey !== null && transaction.counterpartyKey.length > 0;
    return transaction.dictionaryPattern === null && (transaction.normalizedDescription.startsWith('PIX ') || hasCounterparty);
}

export function isPixToPerson(charges: readonly Charge[], cadence: string): boolean {
    return cadence === CADENCES.monthly && charges.every(isPersonPix);
}
