import { SafeParseReturnType } from 'zod';
import { ForeignCashMovement, ForeignExtras, ForeignPosition, ForeignWithholding } from '../investment-statement.types';
import {
    AnswerCashMovement,
    AnswerEnvelope,
    AnswerPosition,
    AnswerWithholding,
    answerCashMovementSchema,
    answerPositionSchema,
    answerWithholdingSchema
} from './model-answer.schema';

function validOf<T>(items: readonly unknown[] | undefined, parse: (item: unknown) => SafeParseReturnType<unknown, T>): T[] {
    return (items ?? []).flatMap((item: unknown): T[] => {
        const parsed: SafeParseReturnType<unknown, T> = parse(item);
        return parsed.success ? [parsed.data] : [];
    });
}

function positionOf(item: AnswerPosition): ForeignPosition {
    return { block: item.block, symbol: item.symbol.toUpperCase(), quantity: item.quantity, price: item.price ?? null };
}

function withholdingOf(item: AnswerWithholding): ForeignWithholding {
    return { tradeDate: item.tradeDate, ticker: item.ticker.toUpperCase(), amountMinor: item.amountMinor };
}

function cashOf(item: AnswerCashMovement): ForeignCashMovement {
    return { tradeDate: item.tradeDate, direction: item.direction, amountMinor: item.amountMinor };
}

export function foreignExtrasOf(envelope: AnswerEnvelope): ForeignExtras {
    return {
        periodStart: envelope.periodStart ?? null,
        periodEnd: envelope.periodEnd ?? null,
        positions: validOf(envelope.positions, (item: unknown) => answerPositionSchema.safeParse(item)).map(positionOf),
        withholdings: validOf(envelope.taxWithholdings, (item: unknown) => answerWithholdingSchema.safeParse(item)).map(withholdingOf),
        cashMovements: validOf(envelope.cashMovements, (item: unknown) => answerCashMovementSchema.safeParse(item)).map(cashOf)
    };
}

export function mergedForeignOf(parts: readonly ForeignExtras[]): ForeignExtras {
    return {
        periodStart:
            parts.map((part: ForeignExtras): string | null => part.periodStart).find((value: string | null): boolean => value !== null) ??
            null,
        periodEnd:
            parts.map((part: ForeignExtras): string | null => part.periodEnd).find((value: string | null): boolean => value !== null) ??
            null,
        positions: parts.flatMap((part: ForeignExtras): readonly ForeignPosition[] => part.positions),
        withholdings: parts.flatMap((part: ForeignExtras): readonly ForeignWithholding[] => part.withholdings),
        cashMovements: parts.flatMap((part: ForeignExtras): readonly ForeignCashMovement[] => part.cashMovements)
    };
}
