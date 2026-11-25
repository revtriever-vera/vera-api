import { mulDecimal, toMinor } from '../../../shared/utils/decimal.util';
import {
    BalanceView,
    EditedLine,
    EvaluatedLine,
    LINE_REASONS,
    LINE_STATUSES,
    LineStatus,
    POSITION_MODES,
    PositionMode
} from './investment-import.types';

const TRADED_KINDS: ReadonlySet<string> = new Set(['buy', 'sell']);
const POSITION_KINDS: ReadonlySet<string> = new Set(['buy', 'sell', 'split', 'reverse_split', 'bonus']);

export function affectsPositionByKind(kind: string): boolean {
    return POSITION_KINDS.has(kind);
}

export function grossOf(edited: EditedLine): number {
    const { line } = edited;
    if (edited.repriced && TRADED_KINDS.has(line.kind) && line.unitPrice !== null) {
        return toMinor(mulDecimal(line.quantity, line.unitPrice), line.currency);
    }
    return line.grossMinor ?? 0;
}

export function hasUnsupportedDirection(edited: EditedLine): boolean {
    return edited.line.kind === 'bonus' && edited.line.direction === 'debit';
}

export interface LineVerdict {
    readonly status: LineStatus;
    readonly reason: string | null;
}

export interface LineFacts {
    readonly edited: EditedLine;
    readonly assetId: string | null;
    readonly duplicate: boolean;
    readonly failure: string | null;
    readonly hasPosition: boolean;
}

export function verdictOf(facts: LineFacts): LineVerdict {
    const { edited } = facts;
    if (edited.skip) {
        return { status: LINE_STATUSES.ignored, reason: LINE_REASONS.skipped };
    }
    if (facts.assetId === null) {
        return { status: LINE_STATUSES.blocked, reason: LINE_REASONS.assetNotFound };
    }
    if (hasUnsupportedDirection(edited)) {
        return { status: LINE_STATUSES.blocked, reason: LINE_REASONS.unsupportedDirection };
    }
    if (facts.duplicate) {
        return { status: LINE_STATUSES.duplicate, reason: LINE_REASONS.duplicate };
    }
    if (facts.failure !== null) {
        return { status: LINE_STATUSES.blocked, reason: facts.failure };
    }
    const needsChoice: boolean = facts.hasPosition && affectsPositionByKind(edited.line.kind) && edited.positionMode === null;
    return needsChoice
        ? { status: LINE_STATUSES.check, reason: LINE_REASONS.positionModeRequired }
        : { status: LINE_STATUSES.ok, reason: null };
}

export function modeOf(edited: EditedLine, hasPosition: boolean): PositionMode | null {
    if (!affectsPositionByKind(edited.line.kind)) {
        return null;
    }
    return edited.positionMode ?? (hasPosition ? null : POSITION_MODES.add);
}

export function evaluatedOf(facts: LineFacts, verdict: LineVerdict): EvaluatedLine {
    const { line } = facts.edited;
    return {
        lineId: line.lineId,
        status: verdict.status,
        reason: verdict.reason,
        kind: line.kind,
        incomeKind: line.incomeKind,
        direction: line.direction,
        tradeDate: line.tradeDate,
        ticker: line.ticker,
        assetId: facts.assetId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        grossMinor: facts.edited.repriced ? grossOf(facts.edited) : line.grossMinor,
        feesMinor: facts.edited.feesMinor,
        currency: line.currency,
        positionMode: modeOf(facts.edited, facts.hasPosition)
    };
}

export function balanceViewOf(balance: BalanceView | null): BalanceView | null {
    return balance === null ? null : { quantity: balance.quantity, averagePrice: balance.averagePrice };
}
