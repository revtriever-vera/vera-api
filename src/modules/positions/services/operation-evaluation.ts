import Decimal from 'decimal.js';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { applyOperations, sortOperations } from '../domain/average-cost';
import { BalanceState, FAILURE_REASONS, FailureReason, OPERATION_KINDS, OperationInput } from '../domain/investment-operations.types';
import { QUANTITY_SCALE } from '../domain/position-merge';

export interface ResolvedOperation {
    readonly raw: OperationInput;
    readonly effective: OperationInput;
}

export interface OperationFailure {
    readonly lineNumber: number;
    readonly tradeDate: string;
    readonly reason: FailureReason;
}

export interface Evaluation {
    readonly resolved: readonly ResolvedOperation[];
    readonly balance: BalanceState | null;
    readonly failures: readonly OperationFailure[];
}

const NO_FACTOR: string = '1';
const FACTOR_PRECISION: number = 40;

function eventKey(operation: OperationInput): string {
    return `${operation.tradeDate}|${operation.kind}`;
}

function signedQuantity(operation: OperationInput): Decimal {
    const quantity: Decimal = DecimalUtil.of(operation.quantity);
    return operation.direction === 'debit' ? quantity.neg() : quantity;
}

function netOfEvents(operations: readonly OperationInput[]): Map<string, Decimal> {
    const nets: Map<string, Decimal> = new Map();
    for (const operation of operations) {
        if (operation.direction !== null) {
            nets.set(eventKey(operation), (nets.get(eventKey(operation)) ?? DecimalUtil.of(0)).add(signedQuantity(operation)));
        }
    }
    return nets;
}

function factorOf(kind: string, held: Decimal, net: Decimal): Decimal | null {
    const total: Decimal = held.add(net);
    if (held.lte(0) || total.lte(0) || net.isZero()) {
        return null;
    }
    if (kind === OPERATION_KINDS.split) {
        return net.gt(0) ? total.div(held) : null;
    }
    return net.lt(0) ? held.div(total) : null;
}

function withQuantity(operation: OperationInput, quantity: string): OperationInput {
    return { ...operation, quantity, direction: null };
}

function failureOf(operation: OperationInput, reason: FailureReason): OperationFailure {
    return { lineNumber: operation.lineNumber, tradeDate: operation.tradeDate, reason };
}

interface Cursor {
    balance: BalanceState | null;
    readonly resolved: ResolvedOperation[];
    readonly failures: OperationFailure[];
    readonly resolvedEvents: Set<string>;
}

function resolveEvent(cursor: Cursor, operation: OperationInput, nets: ReadonlyMap<string, Decimal>): OperationInput | null {
    const key: string = eventKey(operation);
    if (cursor.resolvedEvents.has(key)) {
        return withQuantity(operation, NO_FACTOR);
    }
    const held: Decimal = DecimalUtil.of(cursor.balance?.quantity ?? 0);
    const factor: Decimal | null = factorOf(operation.kind, held, nets.get(key) ?? DecimalUtil.of(0));
    if (factor === null) {
        cursor.failures.push(failureOf(operation, FAILURE_REASONS.eventFactor));
        return null;
    }
    cursor.resolvedEvents.add(key);
    return withQuantity(operation, factor.toDecimalPlaces(FACTOR_PRECISION, Decimal.ROUND_HALF_UP).toFixed());
}

function storedAs(effective: OperationInput, original: OperationInput): OperationInput {
    if (original.direction === null) {
        return effective;
    }
    const rounded: string = DecimalUtil.of(effective.quantity).toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP).toFixed();
    return { ...effective, quantity: rounded };
}

function step(cursor: Cursor, operation: OperationInput, nets: ReadonlyMap<string, Decimal>): void {
    const effective: OperationInput | null = operation.direction === null ? operation : resolveEvent(cursor, operation, nets);
    if (effective === null) {
        return;
    }
    const result: ReturnType<typeof applyOperations> = applyOperations(cursor.balance, [effective]);
    if (!result.ok) {
        cursor.failures.push(failureOf(operation, FAILURE_REASONS.sellExceedsPosition));
        return;
    }
    cursor.balance = result.balance;
    cursor.resolved.push({ raw: operation, effective: storedAs(effective, operation) });
}

export function evaluateOperations(before: BalanceState | null, group: readonly OperationInput[]): Evaluation {
    const cursor: Cursor = { balance: before, resolved: [], failures: [], resolvedEvents: new Set() };
    const nets: Map<string, Decimal> = netOfEvents(group);
    for (const operation of sortOperations(group)) {
        step(cursor, operation, nets);
    }
    return { resolved: cursor.resolved, balance: cursor.balance, failures: cursor.failures };
}
