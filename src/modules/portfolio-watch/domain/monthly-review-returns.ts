import Decimal from 'decimal.js';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import {
    CLASS_REASONS,
    COVERAGE_REASONS,
    OPERATION_KIND_NAMES,
    ClassReason,
    ClassReturn,
    CoverageReason,
    ReturnsResult,
    ReviewOperation
} from './monthly-review.types';
import { MonthlySnapshotEntry } from './portfolio-watch.types';
import { cashFlowOf, isCashFlow } from './review-flows';
import { daysInMonth } from './review-months';

const PERCENT: number = 100;
const PCT_DECIMALS: number = 2;
const FIXED_INCOME_KIND: string = 'fixed_income';
const QUANTITY_TOLERANCE: string = '0.000001';
const UNCLASSIFIED: string = '';

interface Flow {
    readonly amountMinor: number;
    readonly weight: Decimal;
}

interface ClassAccumulator {
    classId: string | null;
    startMinor: number;
    endMinor: number;
    incomeMinor: number;
    readonly flows: Flow[];
    reason: ClassReason | null;
}

export interface ReturnsInput {
    readonly month: string;
    readonly baseCurrency: string;
    readonly start: readonly MonthlySnapshotEntry[];
    readonly end: readonly MonthlySnapshotEntry[];
    readonly operations: readonly ReviewOperation[];
    readonly hasHistory: boolean;
    readonly incomeByAsset: ReadonlyMap<string, number>;
}

/**
 * Modified Dietz: (end - start - net flow + income) / (start + sum(flow x weight)), in percent.
 * Flow is a buy (gross + fees) or a sell (-(gross - fees)) of the month; weight = (days in month - day of month + 1) / days in month.
 * Income is a gain, never a flow. A non-positive denominator has no return.
 */
export function dietzReturn(startMinor: number, endMinor: number, flows: readonly Flow[], incomeMinor: number): Decimal | null {
    const netFlow: number = flows.reduce((total: number, flow: Flow): number => total + flow.amountMinor, 0);
    const base: Decimal = flows.reduce(
        (total: Decimal, flow: Flow): Decimal => total.add(flow.weight.mul(flow.amountMinor)),
        DecimalUtil.of(startMinor)
    );
    if (base.lte(0)) {
        return null;
    }
    return DecimalUtil.of(endMinor - startMinor - netFlow + incomeMinor)
        .div(base)
        .mul(PERCENT);
}

function pctOf(value: Decimal): number {
    return value.toDecimalPlaces(PCT_DECIMALS, Decimal.ROUND_HALF_UP).toNumber();
}

function groupByAsset<T extends { readonly assetId: string }>(items: readonly T[]): Map<string, T[]> {
    const grouped: Map<string, T[]> = new Map();
    for (const item of items) {
        grouped.set(item.assetId, [...(grouped.get(item.assetId) ?? []), item]);
    }
    return grouped;
}

function appliedQuantity(start: Decimal, operations: readonly ReviewOperation[]): Decimal {
    let quantity: Decimal = start;
    for (const operation of operations) {
        const amount: Decimal = DecimalUtil.of(operation.quantity);
        quantity = operation.appliedToPosition ? stepQuantity(quantity, operation.kind, amount) : quantity;
    }
    return quantity;
}

function stepQuantity(quantity: Decimal, kind: string, amount: Decimal): Decimal {
    switch (kind) {
        case OPERATION_KIND_NAMES.buy:
        case OPERATION_KIND_NAMES.bonus:
            return quantity.add(amount);
        case OPERATION_KIND_NAMES.sell:
            return quantity.sub(amount);
        case OPERATION_KIND_NAMES.split:
            return amount.isZero() ? quantity : quantity.mul(amount);
        case OPERATION_KIND_NAMES.reverseSplit:
            return amount.isZero() ? quantity : quantity.div(amount);
        default:
            return quantity;
    }
}

function quantityClosure(
    start: MonthlySnapshotEntry | undefined,
    end: MonthlySnapshotEntry | undefined,
    operations: readonly ReviewOperation[]
): ClassReason | null {
    const expected: Decimal = appliedQuantity(DecimalUtil.of(start?.quantity ?? 0), operations);
    const difference: Decimal = expected.sub(end?.quantity ?? 0).abs();
    return difference.lte(QUANTITY_TOLERANCE) ? null : CLASS_REASONS.quantityMismatch;
}

function closureOf(parts: AssetParts): ClassReason | null {
    const entry: MonthlySnapshotEntry | undefined = parts.end ?? parts.start;
    if (entry === undefined) {
        return CLASS_REASONS.assetWithoutSnapshot;
    }
    if (entry.holdingKind !== FIXED_INCOME_KIND) {
        return quantityClosure(parts.start, parts.end, parts.operations);
    }
    return parts.start !== undefined && parts.end !== undefined ? null : CLASS_REASONS.fixedIncomeFlowUnknown;
}

function accumulatorFor(accumulators: Map<string, ClassAccumulator>, classId: string | null): ClassAccumulator {
    const key: string = classId ?? UNCLASSIFIED;
    const existing: ClassAccumulator | undefined = accumulators.get(key);
    if (existing !== undefined) {
        return existing;
    }
    const created: ClassAccumulator = { classId, startMinor: 0, endMinor: 0, incomeMinor: 0, flows: [], reason: null };
    accumulators.set(key, created);
    return created;
}

function weightOf(month: string, tradeDate: string): Decimal {
    const days: number = daysInMonth(month);
    return DecimalUtil.of(days - Number(tradeDate.slice(8, 10)) + 1).div(days);
}

function addFlows(accumulator: ClassAccumulator, input: ReturnsInput, operations: readonly ReviewOperation[]): void {
    for (const operation of operations) {
        if (!isCashFlow(operation)) {
            continue;
        }
        const amount: number | null = cashFlowOf(operation, input.baseCurrency);
        if (amount === null) {
            accumulator.reason = CLASS_REASONS.unconvertibleFlow;
            continue;
        }
        accumulator.flows.push({ amountMinor: amount, weight: weightOf(input.month, operation.tradeDate) });
    }
}

function addAsset(accumulators: Map<string, ClassAccumulator>, input: ReturnsInput, assetId: string, parts: AssetParts): void {
    const entry: MonthlySnapshotEntry | undefined = parts.end ?? parts.start;
    const accumulator: ClassAccumulator = accumulatorFor(accumulators, entry?.classId ?? null);
    accumulator.startMinor += parts.start?.valueMinor ?? 0;
    accumulator.endMinor += parts.end?.valueMinor ?? 0;
    accumulator.incomeMinor += input.incomeByAsset.get(assetId) ?? 0;
    addFlows(accumulator, input, parts.operations);
    accumulator.reason = accumulator.reason ?? closureOf(parts);
}

interface AssetParts {
    readonly start: MonthlySnapshotEntry | undefined;
    readonly end: MonthlySnapshotEntry | undefined;
    readonly operations: readonly ReviewOperation[];
}

function accumulate(input: ReturnsInput): ClassAccumulator[] {
    const starts: Map<string, MonthlySnapshotEntry[]> = groupByAsset(input.start);
    const ends: Map<string, MonthlySnapshotEntry[]> = groupByAsset(input.end);
    const operations: Map<string, ReviewOperation[]> = groupByAsset(input.operations);
    const assetIds: Set<string> = new Set([...starts.keys(), ...ends.keys(), ...operations.keys()]);
    const accumulators: Map<string, ClassAccumulator> = new Map();
    for (const assetId of assetIds) {
        const parts: AssetParts = {
            start: starts.get(assetId)?.[0],
            end: ends.get(assetId)?.[0],
            operations: operations.get(assetId) ?? []
        };
        addAsset(accumulators, input, assetId, parts);
    }
    return [...accumulators.values()];
}

function classResultOf(accumulator: ClassAccumulator): ClassReturn {
    const base: ClassReturn = { classId: accumulator.classId, startMinor: accumulator.startMinor, endMinor: accumulator.endMinor };
    if (accumulator.reason !== null) {
        return { ...base, reason: accumulator.reason };
    }
    const value: Decimal | null = dietzReturn(accumulator.startMinor, accumulator.endMinor, accumulator.flows, accumulator.incomeMinor);
    return value === null ? { ...base, reason: CLASS_REASONS.noBase } : { ...base, returnPct: pctOf(value) };
}

function totalOf(accumulators: readonly ClassAccumulator[]): Decimal | null {
    const flows: Flow[] = accumulators.flatMap((accumulator: ClassAccumulator): Flow[] => accumulator.flows);
    const sum = (pick: (accumulator: ClassAccumulator) => number): number =>
        accumulators.reduce((total: number, accumulator: ClassAccumulator): number => total + pick(accumulator), 0);
    return dietzReturn(
        sum((accumulator: ClassAccumulator): number => accumulator.startMinor),
        sum((accumulator: ClassAccumulator): number => accumulator.endMinor),
        flows,
        sum((accumulator: ClassAccumulator): number => accumulator.incomeMinor)
    );
}

function unavailable(input: ReturnsInput, reason: CoverageReason): ReturnsResult {
    return { byClass: valuesByClass(input), reason };
}

function valuesByClass(input: ReturnsInput): ClassReturn[] {
    const accumulators: Map<string, ClassAccumulator> = new Map();
    for (const entry of input.start) {
        accumulatorFor(accumulators, entry.classId).startMinor += entry.valueMinor;
    }
    for (const entry of input.end) {
        accumulatorFor(accumulators, entry.classId).endMinor += entry.valueMinor;
    }
    return [...accumulators.values()].map((accumulator: ClassAccumulator): ClassReturn => ({
        classId: accumulator.classId,
        startMinor: accumulator.startMinor,
        endMinor: accumulator.endMinor
    }));
}

export function returnsOf(input: ReturnsInput): ReturnsResult {
    if (!input.hasHistory) {
        return unavailable(input, COVERAGE_REASONS.noOperations);
    }
    if (input.start.length === 0) {
        return unavailable(input, COVERAGE_REASONS.noPreviousSnapshot);
    }
    const accumulators: ClassAccumulator[] = accumulate(input);
    const byClass: ClassReturn[] = accumulators.map(classResultOf);
    if (byClass.some((row: ClassReturn): boolean => row.returnPct === undefined)) {
        return { byClass, reason: COVERAGE_REASONS.classesNotClosing };
    }
    const total: Decimal | null = totalOf(accumulators);
    return total === null ? { byClass, reason: COVERAGE_REASONS.noBase } : { byClass, returnPct: pctOf(total), reason: null };
}
