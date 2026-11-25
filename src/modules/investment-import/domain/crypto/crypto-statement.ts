import { divDecimal, DecimalUtil, mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import { CRYPTO_QUANTITY_DECIMALS, NOTE_CODES } from '../investment-import.types';
import {
    IncomeKind,
    OperationDirection,
    OperationKind,
    PARSED_SOURCES,
    ParsedInvestmentStatement,
    ParsedOperation,
    REJECT_REASONS,
    RejectedLine,
    RejectReason,
    StatementNote
} from '../investment-statement.types';
import { matchKeyOf } from '../b3/b3-negotiation.parser';
import { CryptoAmount, CryptoEvent, CryptoReading, ExchangeEvent, IncomeEvent, TransferEvent, UsdRates } from './crypto-events.types';
import { BRL, brlOf, isFiat, usesDollar, valueOfExchange } from './crypto-valuation';

const PRICE_DECIMALS: number = 8;

interface Leg {
    readonly asset: string;
    readonly side: 'buy' | 'sell';
    readonly quantity: string;
}

interface Tally {
    transfers: number;
    usdRateApplied: number;
    feesNotConverted: number;
}

interface Built {
    readonly operations: readonly ParsedOperation[];
    readonly fault: RejectReason | null;
}

interface Context {
    readonly reading: CryptoReading;
    readonly rates: UsdRates;
    readonly tally: Tally;
}

interface OperationFacts {
    readonly kind: OperationKind;
    readonly incomeKind: IncomeKind | null;
    readonly direction: OperationDirection;
    readonly asset: string;
    readonly quantity: string;
    readonly unitPrice: string | null;
    readonly grossMinor: number | null;
    readonly feesMinor: number;
    readonly appliedToPosition: boolean;
    readonly reference: string;
}

function fail(fault: RejectReason): Built {
    return { operations: [], fault };
}

function roundQuantity(value: string): string {
    return DecimalUtil.of(value).toDecimalPlaces(CRYPTO_QUANTITY_DECIMALS).toFixed();
}

function operationOf(context: Context, event: CryptoEvent, facts: OperationFacts): ParsedOperation {
    const operation: Omit<ParsedOperation, 'matchKey' | 'alreadyImported'> = {
        sheet: '',
        line: event.line,
        kind: facts.kind,
        incomeKind: facts.incomeKind,
        direction: facts.direction,
        tradeDate: event.tradeDate,
        ticker: facts.asset,
        productName: null,
        institution: context.reading.exchange,
        market: null,
        quantity: facts.quantity,
        unitPrice: facts.unitPrice,
        grossMinor: facts.grossMinor,
        feesMinor: facts.feesMinor,
        currency: BRL,
        appliedToPosition: facts.appliedToPosition,
        externalRef: event.externalId === null ? null : `${context.reading.exchange}:${event.externalId}:${facts.reference}`
    };
    return { ...operation, matchKey: matchKeyOf(operation), alreadyImported: false };
}

function legsOf(event: ExchangeEvent): Leg[] {
    const legs: Leg[] = [
        { asset: event.sold.asset, side: 'sell', quantity: event.sold.quantity },
        { asset: event.bought.asset, side: 'buy', quantity: event.bought.quantity }
    ];
    return legs.filter((leg: Leg): boolean => !isFiat(leg.asset));
}

function withoutFee(legs: readonly Leg[], fee: CryptoAmount | null): Leg[] | null {
    if (fee === null) {
        return [...legs];
    }
    const adjusted: Leg[] = legs.map((leg: Leg): Leg =>
        leg.side === 'buy' && leg.asset === fee.asset ? { ...leg, quantity: DecimalUtil.of(leg.quantity).sub(fee.quantity).toFixed() } : leg
    );
    return adjusted.every((leg: Leg): boolean => Number(roundQuantity(leg.quantity)) > 0) ? adjusted : null;
}

function feeInBrl(event: ExchangeEvent, legs: readonly Leg[], value: string, context: Context): string | null {
    const fee: CryptoAmount | null = event.fee;
    if (fee === null || legs.some((leg: Leg): boolean => leg.side === 'buy' && leg.asset === fee.asset)) {
        return '0';
    }
    const direct: string | null = brlOf(fee, event.tradeDate, context.rates);
    const leg: Leg | undefined = legs.find((candidate: Leg): boolean => candidate.asset === fee.asset);
    if (direct === null && leg !== undefined) {
        return mulDecimal(divDecimal(value, leg.quantity), fee.quantity);
    }
    return direct;
}

function legOperation(context: Context, event: ExchangeEvent, leg: Leg, extra: { value: string; fees: number }): ParsedOperation {
    const quantity: string = roundQuantity(leg.quantity);
    return operationOf(context, event, {
        kind: leg.side,
        incomeKind: null,
        direction: leg.side === 'buy' ? 'credit' : 'debit',
        asset: leg.asset,
        quantity,
        unitPrice: divDecimal(extra.value, quantity, PRICE_DECIMALS),
        grossMinor: toMinor(extra.value, BRL),
        feesMinor: extra.fees,
        appliedToPosition: true,
        reference: `${leg.side}:${leg.asset}`
    });
}

function needsRate(event: ExchangeEvent): boolean {
    return ![event.sold, event.bought, event.valuation].some((amount: CryptoAmount | null): boolean => amount?.asset === BRL);
}

function buildExchange(context: Context, event: ExchangeEvent): Built {
    const value: string | null = valueOfExchange(event, context.rates);
    const baseLegs: Leg[] = legsOf(event);
    if (value === null || Number(value) <= 0 || baseLegs.length === 0) {
        return fail(REJECT_REASONS.invalidAmount);
    }
    const legs: Leg[] | null = withoutFee(baseLegs, event.fee);
    if (legs === null) {
        return fail(REJECT_REASONS.invalidQuantity);
    }
    const feeValue: string | null = feeInBrl(event, legs, value, context);
    context.tally.feesNotConverted += feeValue === null ? 1 : 0;
    context.tally.usdRateApplied += needsRate(event) ? 1 : 0;
    const fees: number = feeValue === null ? 0 : toMinor(feeValue, BRL);
    return {
        operations: legs.map((leg: Leg, index: number): ParsedOperation =>
            legOperation(context, event, leg, { value, fees: index === 0 ? fees : 0 })
        ),
        fault: null
    };
}

function buildTransfer(context: Context, event: TransferEvent): Built {
    const quantity: string = roundQuantity(event.moved.quantity);
    if (Number(quantity) <= 0) {
        return fail(REJECT_REASONS.invalidQuantity);
    }
    context.tally.transfers += 1;
    const operation: ParsedOperation = operationOf(context, event, {
        kind: 'transfer',
        incomeKind: null,
        direction: event.direction,
        asset: event.moved.asset,
        quantity,
        unitPrice: null,
        grossMinor: null,
        feesMinor: 0,
        appliedToPosition: false,
        reference: event.direction
    });
    return { operations: [operation], fault: null };
}

function buildIncome(context: Context, event: IncomeEvent): Built {
    const quantity: string = roundQuantity(event.received.quantity);
    if (Number(quantity) <= 0) {
        return fail(REJECT_REASONS.invalidQuantity);
    }
    const value: string | null = event.valuation === null ? null : brlOf(event.valuation, event.tradeDate, context.rates);
    const operation: ParsedOperation = operationOf(context, event, {
        kind: 'income',
        incomeKind: event.incomeKind,
        direction: 'credit',
        asset: event.received.asset,
        quantity,
        unitPrice: null,
        grossMinor: value === null ? null : toMinor(value, BRL),
        feesMinor: 0,
        appliedToPosition: false,
        reference: 'income'
    });
    return { operations: [operation], fault: null };
}

function build(context: Context, event: CryptoEvent): Built {
    if (event.kind === 'exchange') {
        return buildExchange(context, event);
    }
    return event.kind === 'transfer' ? buildTransfer(context, event) : buildIncome(context, event);
}

function notesOf(tally: Tally): StatementNote[] {
    const candidates: readonly StatementNote[] = [
        { code: NOTE_CODES.cryptoTransferCheck, count: tally.transfers },
        { code: NOTE_CODES.cryptoUsdRateApplied, count: tally.usdRateApplied },
        { code: NOTE_CODES.cryptoFeeNotConverted, count: tally.feesNotConverted }
    ];
    return candidates.filter((note: StatementNote): boolean => note.count > 0);
}

export function usdDatesOf(reading: CryptoReading): string[] {
    return [...new Set(reading.events.filter(usesDollar).map((event: CryptoEvent): string => event.tradeDate))];
}

function absorb(context: Context, event: CryptoEvent, operations: ParsedOperation[], rejected: RejectedLine[]): void {
    const built: Built = build(context, event);
    operations.push(...built.operations);
    if (built.fault !== null) {
        rejected.push({ sheet: '', line: event.line, reason: built.fault });
    }
}

export function cryptoStatementOf(reading: CryptoReading, rates: UsdRates): ParsedInvestmentStatement {
    const tally: Tally = { transfers: 0, usdRateApplied: 0, feesNotConverted: 0 };
    const operations: ParsedOperation[] = [];
    const rejected: RejectedLine[] = [...reading.rejected];
    for (const event of reading.events) {
        absorb({ reading, rates, tally }, event, operations, rejected);
    }
    return {
        source: PARSED_SOURCES.cryptoCsv,
        reportKinds: [],
        currency: BRL,
        operations,
        positionAdjustments: [],
        fixedIncome: [],
        ignored: [...reading.ignored],
        rejected,
        notes: notesOf(tally)
    };
}
