import { SafeParseReturnType } from 'zod';
import { mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import { allocateFees } from '../../../../shared/utils/fee-allocation.util';
import { LINE_REASONS } from '../investment-import.types';
import { IGNORE_REASONS, IgnoredLine, ParsedOperation, REJECT_REASONS, RejectedLine } from '../investment-statement.types';
import { AnswerNote, AnswerNoteTrade, answerNoteSchema, answerNoteTradeSchema } from './model-answer.schema';
import { operationOf, rejectReasonOf, tickerFrom, UNSUPPORTED_MARKET } from './model-operation';
import { specKeyOf } from './security-spec';

const BRL: string = 'BRL';

export interface NoteContext {
    readonly page: string;
    readonly today: string;
    readonly tickersBySpec: ReadonlyMap<string, string>;
    readonly nextLine: () => number;
}

export interface NoteReading {
    readonly operations: ParsedOperation[];
    readonly ignored: IgnoredLine[];
    readonly rejected: RejectedLine[];
    readonly totalMismatches: number;
    readonly netMismatches: number;
}

interface ReadTrade {
    readonly trade: AnswerNoteTrade;
    readonly line: number;
    readonly grossMinor: number | null;
}

function emptyReading(): NoteReading {
    return { operations: [], ignored: [], rejected: [], totalMismatches: 0, netMismatches: 0 };
}

function grossOf(trade: AnswerNoteTrade): number | null {
    if (trade.grossMinor !== null && trade.grossMinor !== undefined) {
        return Math.abs(trade.grossMinor);
    }
    return trade.unitPrice === null || trade.unitPrice === undefined ? null : toMinor(mulDecimal(trade.quantity, trade.unitPrice), BRL);
}

function feesOf(note: AnswerNote): { readonly costsMinor: number; readonly irrfMinor: number } {
    const fees: NonNullable<AnswerNote['fees']> = note.fees ?? {};
    const costsMinor: number = [
        fees.settlementMinor,
        fees.exchangeMinor,
        fees.brokerageMinor,
        fees.issMinor,
        fees.otherMinor
    ].reduce<number>((sum: number, value: number | null | undefined): number => sum + Math.abs(value ?? 0), 0);
    return { costsMinor, irrfMinor: Math.abs(fees.irrfMinor ?? 0) };
}

function specKeys(trade: AnswerNoteTrade): string | null {
    const spec: string = specKeyOf(trade.securitySpec ?? '');
    return spec === '' ? null : spec;
}

export function specsOfNote(item: unknown): string[] {
    const note: SafeParseReturnType<unknown, AnswerNote> = answerNoteSchema.safeParse(item);
    if (!note.success) {
        return [];
    }
    return note.data.trades.flatMap((raw: unknown): string[] => {
        const trade: SafeParseReturnType<unknown, AnswerNoteTrade> = answerNoteTradeSchema.safeParse(raw);
        const key: string | null = trade.success ? specKeys(trade.data) : null;
        const hasCode: boolean = trade.success && (trade.data.code ?? '').trim() !== '';
        return key === null || hasCode ? [] : [key];
    });
}

function readTrade(raw: unknown, context: NoteContext, reading: NoteReading): ReadTrade | null {
    const line: number = context.nextLine();
    const parsed: SafeParseReturnType<unknown, AnswerNoteTrade> = answerNoteTradeSchema.safeParse(raw);
    if (!parsed.success) {
        reading.rejected.push({ sheet: context.page, line, reason: rejectReasonOf(parsed.error) });
        return null;
    }
    if ((parsed.data.code ?? '').trim() === '' && specKeys(parsed.data) === null) {
        reading.rejected.push({ sheet: context.page, line, reason: REJECT_REASONS.missingAsset });
        return null;
    }
    return { trade: parsed.data, line, grossMinor: grossOf(parsed.data) };
}

function readTrades(note: AnswerNote, context: NoteContext, reading: NoteReading): ReadTrade[] {
    return note.trades.flatMap((raw: unknown): ReadTrade[] => {
        const read: ReadTrade | null = readTrade(raw, context, reading);
        return read === null ? [] : [read];
    });
}

function tickerOf(trade: AnswerNoteTrade, context: NoteContext): string {
    const code: string = (trade.code ?? '').trim();
    if (code !== '') {
        return tickerFrom(code, trade.market);
    }
    const key: string = specKeys(trade) ?? '';
    return context.tickersBySpec.get(key) ?? tickerFrom(key, trade.market);
}

function operationFor(read: ReadTrade, note: AnswerNote, context: NoteContext, feesMinor: number): ParsedOperation {
    const { trade } = read;
    const operation: ParsedOperation = operationOf(
        {
            kind: trade.side,
            direction: trade.side === 'buy' ? 'credit' : 'debit',
            tradeDate: note.tradeDate,
            ticker: tickerOf(trade, context),
            productName: trade.securitySpec ?? null,
            institution: note.broker ?? null,
            market: trade.market ?? null,
            quantity: trade.quantity,
            unitPrice: trade.unitPrice ?? null,
            grossMinor: read.grossMinor,
            currency: BRL
        },
        context.page,
        read.line,
        context.today
    );
    return { ...operation, feesMinor };
}

function ignoredFor(read: ReadTrade, note: AnswerNote, context: NoteContext): IgnoredLine {
    return {
        sheet: context.page,
        line: read.line,
        reason: IGNORE_REASONS.unsupportedMarket,
        description: read.trade.securitySpec ?? read.trade.code ?? '',
        tradeDate: note.tradeDate,
        productCode: read.trade.code ?? null
    };
}

function signedOf(read: ReadTrade): number {
    return (read.trade.side === 'sell' ? 1 : -1) * (read.grossMinor ?? 0);
}

function isComplete(reads: readonly ReadTrade[], rejected: number): boolean {
    return rejected === 0 && reads.every((read: ReadTrade): boolean => read.grossMinor !== null);
}

function withCheck(operation: ParsedOperation, check: string | null): ParsedOperation {
    return check === null || operation.check !== undefined ? operation : { ...operation, check };
}

interface NoteChecks {
    readonly reason: string | null;
    readonly totalWrong: boolean;
    readonly netWrong: boolean;
}

function checksOf(note: AnswerNote, reads: readonly ReadTrade[], complete: boolean): NoteChecks {
    const { costsMinor, irrfMinor } = feesOf(note);
    const tolerance: number = reads.length;
    const printedTotal: number | null = note.operationsTotalMinor ?? null;
    const printedNet: number | null = note.netMinor ?? null;
    const totalSum: number = reads.reduce((sum: number, read: ReadTrade): number => sum + (read.grossMinor ?? 0), 0);
    const expectedNet: number = reads.reduce((sum: number, read: ReadTrade): number => sum + signedOf(read), 0) - costsMinor - irrfMinor;
    const totalWrong: boolean = complete && printedTotal !== null && Math.abs(totalSum - Math.abs(printedTotal)) > tolerance;
    const netWrong: boolean = complete && printedNet !== null && Math.abs(expectedNet - printedNet) > tolerance;
    const netReason: string | null = netWrong ? LINE_REASONS.netMismatch : null;
    return { reason: totalWrong ? LINE_REASONS.totalMismatch : netReason, totalWrong, netWrong };
}

function addOperations(
    reading: NoteReading,
    reads: readonly ReadTrade[],
    note: AnswerNote,
    context: NoteContext,
    check: string | null
): void {
    const shares: number[] = allocateFees(
        feesOf(note).costsMinor,
        reads.map((read: ReadTrade): number => read.grossMinor ?? 0)
    );
    reads.forEach((read: ReadTrade, index: number): void => {
        if (UNSUPPORTED_MARKET.test(read.trade.market ?? '')) {
            reading.ignored.push(ignoredFor(read, note, context));
            return;
        }
        reading.operations.push(withCheck(operationFor(read, note, context, shares[index] ?? 0), check));
    });
}

export function readNote(item: unknown, context: NoteContext): NoteReading {
    const reading: NoteReading = emptyReading();
    const parsed: SafeParseReturnType<unknown, AnswerNote> = answerNoteSchema.safeParse(item);
    if (!parsed.success) {
        reading.rejected.push({ sheet: context.page, line: context.nextLine(), reason: rejectReasonOf(parsed.error) });
        return reading;
    }
    const note: AnswerNote = parsed.data;
    const reads: ReadTrade[] = readTrades(note, context, reading);
    const checks: NoteChecks = checksOf(note, reads, isComplete(reads, reading.rejected.length));
    addOperations(reading, reads, note, context, checks.reason);
    return { ...reading, totalMismatches: checks.totalWrong ? 1 : 0, netMismatches: !checks.totalWrong && checks.netWrong ? 1 : 0 };
}
