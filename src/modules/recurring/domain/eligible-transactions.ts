import { daysBetween, signedDaysBetween } from './recurring-dates';
import { merchantKeyOf } from './merchant-key';
import { DetectorTransaction, MERCHANT_KEY_MIN_LENGTH, MIRROR_MAX_DAYS, REFUND_MAX_DAYS, REFUND_VALUE_TOLERANCE } from './recurring.types';

function byDateThenId(left: DetectorTransaction, right: DetectorTransaction): number {
    return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function pushTo(index: Map<string, DetectorTransaction[]>, key: string, transaction: DetectorTransaction): void {
    const bucket: DetectorTransaction[] = index.get(key) ?? [];
    bucket.push(transaction);
    index.set(key, bucket);
}

function closestMirror(
    candidates: readonly DetectorTransaction[],
    outflow: DetectorTransaction,
    used: ReadonlySet<string>
): DetectorTransaction | null {
    let best: DetectorTransaction | null = null;
    for (const candidate of candidates) {
        const near: boolean = daysBetween(candidate.date, outflow.date) <= MIRROR_MAX_DAYS;
        const free: boolean = !used.has(candidate.id) && candidate.accountId !== outflow.accountId;
        const closer: boolean = best === null || daysBetween(candidate.date, outflow.date) < daysBetween(best.date, outflow.date);
        if (near && free && closer) {
            best = candidate;
        }
    }
    return best;
}

function inflowsByAmountOf(transactions: readonly DetectorTransaction[]): ReadonlyMap<string, readonly DetectorTransaction[]> {
    const inflowsByAmount: Map<string, DetectorTransaction[]> = new Map<string, DetectorTransaction[]>();
    for (const transaction of transactions) {
        if (transaction.amountMinor > 0) {
            pushTo(inflowsByAmount, String(transaction.amountMinor), transaction);
        }
    }
    return inflowsByAmount;
}

export function findMirrorIds(transactions: readonly DetectorTransaction[]): ReadonlySet<string> {
    const inflowsByAmount: ReadonlyMap<string, readonly DetectorTransaction[]> = inflowsByAmountOf(transactions);
    const mirrored: Set<string> = new Set<string>();
    const outflows: DetectorTransaction[] = transactions
        .filter((item: DetectorTransaction): boolean => item.amountMinor < 0)
        .toSorted(byDateThenId);
    for (const outflow of outflows) {
        const mirror: DetectorTransaction | null = closestMirror(
            inflowsByAmount.get(String(-outflow.amountMinor)) ?? [],
            outflow,
            mirrored
        );
        if (mirror !== null) {
            mirrored.add(mirror.id);
            mirrored.add(outflow.id);
        }
    }
    return mirrored;
}

const REFUND_PREFIX: RegExp = /^(?:(?:ESTORNO|CRED|CREDITO|DEVOLUCAO|REEMBOLSO)\s+)(?:(?:DE|DA|DO)\s+)?/;

function withoutRefundPrefix(key: string): string {
    let current: string = key;
    let previous: string = '';
    while (previous !== current) {
        previous = current;
        current = current.replace(REFUND_PREFIX, '').trim();
    }
    return current;
}

function refundKeys(transaction: DetectorTransaction): readonly string[] {
    const keys: string[] = [];
    const merchant: string | null = merchantKeyOf(transaction);
    if (merchant !== null) {
        keys.push(`m:${merchant}`);
        const stripped: string = transaction.amountMinor > 0 ? withoutRefundPrefix(merchant) : merchant;
        if (stripped !== merchant && stripped.length >= MERCHANT_KEY_MIN_LENGTH) {
            keys.push(`m:${stripped}`);
        }
    }
    if (transaction.counterpartyKey !== null) {
        keys.push(`c:${transaction.counterpartyKey}`);
    }
    return keys;
}

function isRefundOf(inflow: DetectorTransaction, outflow: DetectorTransaction): boolean {
    const elapsed: number = signedDaysBetween(outflow.date, inflow.date);
    const gap: number = Math.abs(inflow.amountMinor + outflow.amountMinor);
    return elapsed >= 0 && elapsed <= REFUND_MAX_DAYS && gap <= REFUND_VALUE_TOLERANCE * -outflow.amountMinor;
}

function takeRefund(
    outflow: DetectorTransaction,
    inflowsByKey: ReadonlyMap<string, readonly DetectorTransaction[]>,
    used: ReadonlySet<string>
): DetectorTransaction | null {
    return (
        refundKeys(outflow)
            .flatMap((key: string): readonly DetectorTransaction[] => inflowsByKey.get(key) ?? [])
            .find((inflow: DetectorTransaction): boolean => !used.has(inflow.id) && isRefundOf(inflow, outflow)) ?? null
    );
}

function inflowsByKeyOf(transactions: readonly DetectorTransaction[]): ReadonlyMap<string, readonly DetectorTransaction[]> {
    const inflowsByKey: Map<string, DetectorTransaction[]> = new Map<string, DetectorTransaction[]>();
    const keyed: readonly { readonly key: string; readonly transaction: DetectorTransaction }[] = transactions
        .toSorted(byDateThenId)
        .filter((transaction: DetectorTransaction): boolean => transaction.amountMinor > 0)
        .flatMap((transaction: DetectorTransaction) => refundKeys(transaction).map((key: string) => ({ key, transaction })));
    for (const { key, transaction } of keyed) {
        pushTo(inflowsByKey, key, transaction);
    }
    return inflowsByKey;
}

export function findRefundedIds(transactions: readonly DetectorTransaction[]): ReadonlySet<string> {
    const inflowsByKey: ReadonlyMap<string, readonly DetectorTransaction[]> = inflowsByKeyOf(transactions);
    const used: Set<string> = new Set<string>();
    const refunded: Set<string> = new Set<string>();
    const outflows: readonly DetectorTransaction[] = transactions
        .filter((item: DetectorTransaction): boolean => item.amountMinor < 0)
        .toSorted(byDateThenId);
    for (const outflow of outflows) {
        const inflow: DetectorTransaction | null = takeRefund(outflow, inflowsByKey, used);
        if (inflow !== null) {
            used.add(inflow.id);
            refunded.add(outflow.id);
        }
    }
    return refunded;
}

function dropSamples(transactions: readonly DetectorTransaction[]): readonly DetectorTransaction[] {
    const hasReal: boolean = transactions.some((transaction: DetectorTransaction): boolean => !transaction.isSample);
    return hasReal ? transactions.filter((transaction: DetectorTransaction): boolean => !transaction.isSample) : transactions;
}

export function selectEligible(transactions: readonly DetectorTransaction[]): readonly DetectorTransaction[] {
    const pool: readonly DetectorTransaction[] = dropSamples(transactions);
    const mirrored: ReadonlySet<string> = findMirrorIds(pool);
    const remaining: readonly DetectorTransaction[] = pool.filter(
        (transaction: DetectorTransaction): boolean => !mirrored.has(transaction.id)
    );
    const refunded: ReadonlySet<string> = findRefundedIds(remaining);
    return remaining.filter(
        (transaction: DetectorTransaction): boolean =>
            transaction.amountMinor < 0 &&
            transaction.categoryKind !== 'transfer' &&
            transaction.installmentTotal === null &&
            !refunded.has(transaction.id)
    );
}
