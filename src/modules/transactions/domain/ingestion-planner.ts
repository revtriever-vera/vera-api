import { CandidatePool, MatchCandidate } from './cross-source-matcher';
import { toDateString } from './transaction.mapper';
import { FILE_SOURCES, PreparedTransaction, TRANSACTION_SOURCES, Transaction, TransactionSource } from './transactions.types';

export interface RowCandidate extends MatchCandidate {
    readonly row: Transaction;
}

export type Decision =
    | { readonly kind: 'unchanged' }
    | { readonly kind: 'duplicate' }
    | { readonly kind: 'absorb'; readonly target: Transaction }
    | { readonly kind: 'update'; readonly row: Transaction; readonly recategorize: boolean }
    | { readonly kind: 'insert'; readonly id: string }
    | { readonly kind: 'supersede'; readonly id: string; readonly file: Transaction };

export interface PlannedItem {
    readonly item: PreparedTransaction;
    readonly decision: Decision;
}

export interface PlanContext {
    readonly source: TransactionSource;
    readonly existing: ReadonlyMap<string, Transaction>;
    readonly absorbedIds: ReadonlySet<string>;
    readonly pool: CandidatePool<RowCandidate>;
    readonly newId: () => string;
}

export function toCandidate(row: Transaction): RowCandidate {
    return { id: row.id, amountMinor: Number(row.amountMinor), date: toDateString(row.date), createdAt: row.createdAt, row };
}

export function isFileSource(source: TransactionSource): boolean {
    return FILE_SOURCES.includes(source);
}

export function hasChanged(row: Transaction, item: PreparedTransaction): boolean {
    return (
        toDateString(row.date) !== item.date ||
        Number(row.amountMinor) !== item.amountMinor ||
        row.description !== item.description ||
        row.providerCategoryId !== item.providerCategoryId ||
        row.counterpartyName !== item.counterpartyName ||
        row.counterpartyKey !== item.counterpartyKey
    );
}

export function needsRecategorization(row: Transaction, item: PreparedTransaction): boolean {
    return row.categorySource !== 'user' && (row.description !== item.description || row.providerCategoryId !== item.providerCategoryId);
}

function decideExisting(row: Transaction, item: PreparedTransaction): Decision {
    return hasChanged(row, item) ? { kind: 'update', row, recategorize: needsRecategorization(row, item) } : { kind: 'unchanged' };
}

function decideCrossSource(item: PreparedTransaction, context: PlanContext): Decision {
    const match: RowCandidate | null = context.pool.take(item);
    if (match === null) {
        return { kind: 'insert', id: context.newId() };
    }
    return context.source === TRANSACTION_SOURCES.pluggy
        ? { kind: 'supersede', id: context.newId(), file: match.row }
        : { kind: 'absorb', target: match.row };
}

export function decide(item: PreparedTransaction, context: PlanContext): Decision {
    const row: Transaction | undefined = context.existing.get(item.externalId);
    if (row !== undefined) {
        return decideExisting(row, item);
    }
    if (isFileSource(context.source) && context.absorbedIds.has(item.externalId)) {
        return { kind: 'duplicate' };
    }
    return decideCrossSource(item, context);
}

export function plan(items: readonly PreparedTransaction[], context: PlanContext): PlannedItem[] {
    return items.map((item: PreparedTransaction): PlannedItem => ({ item, decision: decide(item, context) }));
}
