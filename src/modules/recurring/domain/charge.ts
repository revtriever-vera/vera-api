import { DetectorTransaction } from './recurring.types';

export interface Charge {
    readonly transaction: DetectorTransaction;
    readonly amountMinor: number;
}

export function toCharge(transaction: DetectorTransaction): Charge {
    return { transaction, amountMinor: -transaction.amountMinor };
}

export function byDate(left: Charge, right: Charge): number {
    return left.transaction.date.localeCompare(right.transaction.date) || left.transaction.id.localeCompare(right.transaction.id);
}

export function byAmount(left: Charge, right: Charge): number {
    return left.amountMinor - right.amountMinor || byDate(left, right);
}
