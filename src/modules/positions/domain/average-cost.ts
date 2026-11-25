import Decimal from 'decimal.js';
import { currencyExponent, DecimalUtil } from '../../../shared/utils/decimal.util';
import { PRICE_SCALE, QUANTITY_SCALE } from './position-merge';
import { BalanceState, CostOperation, OPERATION_KINDS, OperationKind } from './investment-operations.types';

export type AverageCostResult =
    { readonly ok: true; readonly balance: BalanceState | null } | { readonly ok: false; readonly error: AverageCostError };

export interface AverageCostError {
    readonly code: 'sell_exceeds_position';
    readonly operation: CostOperation;
}

interface Holding {
    readonly quantity: Decimal;
    readonly average: Decimal | null;
}

type Step = (holding: Holding | null, operation: CostOperation) => Holding | null | 'exceeds';

const POSITION_KINDS: ReadonlySet<OperationKind> = new Set<OperationKind>([
    OPERATION_KINDS.buy,
    OPERATION_KINDS.sell,
    OPERATION_KINDS.split,
    OPERATION_KINDS.reverseSplit,
    OPERATION_KINDS.bonus
]);

const EVENT_KINDS: ReadonlySet<OperationKind> = new Set<OperationKind>([
    OPERATION_KINDS.split,
    OPERATION_KINDS.reverseSplit,
    OPERATION_KINDS.bonus
]);

export function affectsPosition(operation: Pick<CostOperation, 'kind' | 'dayTrade' | 'historyOnly'>): boolean {
    if (operation.historyOnly || !POSITION_KINDS.has(operation.kind)) {
        return false;
    }
    return EVENT_KINDS.has(operation.kind) || !operation.dayTrade;
}

export function sortOperations<T extends Pick<CostOperation, 'tradeDate' | 'lineNumber'>>(operations: readonly T[]): T[] {
    return [...operations].sort((left: T, right: T): number => {
        if (left.tradeDate !== right.tradeDate) {
            return left.tradeDate < right.tradeDate ? -1 : 1;
        }
        return left.lineNumber - right.lineNumber;
    });
}

function round(value: Decimal, scale: number): Decimal {
    return value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

function holdingOf(balance: BalanceState | null): Holding | null {
    if (balance === null) {
        return null;
    }
    const quantity: Decimal = DecimalUtil.of(balance.quantity);
    return quantity.isZero() ? null : { quantity, average: balance.averagePrice === null ? null : DecimalUtil.of(balance.averagePrice) };
}

function balanceOf(holding: Holding | null): BalanceState | null {
    if (holding === null || holding.quantity.isZero()) {
        return null;
    }
    return {
        quantity: round(holding.quantity, QUANTITY_SCALE).toFixed(),
        averagePrice: holding.average === null ? null : round(holding.average, PRICE_SCALE).toFixed()
    };
}

function feesOf(operation: CostOperation): Decimal {
    return DecimalUtil.of(operation.feesMinor).div(DecimalUtil.of(10).pow(currencyExponent(operation.currency)));
}

interface PricedPart {
    readonly quantity: Decimal;
    readonly cost: Decimal;
}

function pricedPartOf(holding: Holding | null): PricedPart {
    if (holding?.average === undefined || holding.average === null) {
        return { quantity: DecimalUtil.of(0), cost: DecimalUtil.of(0) };
    }
    return { quantity: holding.quantity, cost: holding.quantity.mul(holding.average) };
}

function buy(holding: Holding | null, operation: CostOperation): Holding | null {
    const bought: Decimal = DecimalUtil.of(operation.quantity);
    if (bought.isZero()) {
        return holding;
    }
    const priced: PricedPart = pricedPartOf(holding);
    const cost: Decimal = bought.mul(operation.unitPrice).add(feesOf(operation));
    const average: Decimal = priced.cost.add(cost).div(priced.quantity.add(bought));
    return { quantity: (holding?.quantity ?? DecimalUtil.of(0)).add(bought), average };
}

function sell(holding: Holding | null, operation: CostOperation): Holding | null | 'exceeds' {
    const sold: Decimal = DecimalUtil.of(operation.quantity);
    if (sold.isZero()) {
        return holding;
    }
    if (holding === null || sold.gt(holding.quantity)) {
        return 'exceeds';
    }
    return { quantity: holding.quantity.sub(sold), average: holding.average };
}

function split(holding: Holding | null, operation: CostOperation): Holding | null {
    const factor: Decimal = DecimalUtil.of(operation.quantity);
    if (holding === null || factor.isZero()) {
        return holding;
    }
    return { quantity: holding.quantity.mul(factor), average: holding.average?.div(factor) ?? null };
}

function reverseSplit(holding: Holding | null, operation: CostOperation): Holding | null {
    const factor: Decimal = DecimalUtil.of(operation.quantity);
    if (holding === null || factor.isZero()) {
        return holding;
    }
    return { quantity: holding.quantity.div(factor), average: holding.average?.mul(factor) ?? null };
}

function bonus(holding: Holding | null, operation: CostOperation): Holding | null {
    if (holding === null) {
        return holding;
    }
    const received: Decimal = DecimalUtil.of(operation.quantity);
    const quantity: Decimal = holding.quantity.add(received);
    return { quantity, average: holding.average === null ? null : holding.quantity.mul(holding.average).div(quantity) };
}

const STEPS: Readonly<Partial<Record<OperationKind, Step>>> = {
    [OPERATION_KINDS.buy]: buy,
    [OPERATION_KINDS.sell]: sell,
    [OPERATION_KINDS.split]: split,
    [OPERATION_KINDS.reverseSplit]: reverseSplit,
    [OPERATION_KINDS.bonus]: bonus
};

export function applyOperations(current: BalanceState | null, operations: readonly CostOperation[]): AverageCostResult {
    let holding: Holding | null = holdingOf(current);
    for (const operation of sortOperations(operations)) {
        const step: Step | undefined = affectsPosition(operation) ? STEPS[operation.kind] : undefined;
        const next: Holding | null | 'exceeds' = step === undefined ? holding : step(holding, operation);
        if (next === 'exceeds') {
            return { ok: false, error: { code: 'sell_exceeds_position', operation } };
        }
        holding = holdingOf(balanceOf(next));
    }
    return { ok: true, balance: balanceOf(holding) };
}
