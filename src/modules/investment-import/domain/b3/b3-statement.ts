import {
    B3_REPORT_KINDS,
    B3ReportKind,
    IgnoredLine,
    PARSED_SOURCES,
    ParsedFixedIncome,
    ParsedInvestmentStatement,
    ParsedOperation,
    ParsedPositionAdjustment,
    RejectedLine
} from '../investment-statement.types';
import { FormatNotRecognizedError } from '../investment-import.errors';
import { RawTable } from './b3-cells';
import { B3Sheet, detectB3Sheet } from './b3-detector';
import { parseFixedIncome } from './b3-fixed-income.parser';
import { parseMovements } from './b3-movement.parser';
import { parseNegotiation } from './b3-negotiation.parser';
import { parsePositions } from './b3-position.parser';
import { Collected } from './b3-rows';

interface Accumulator {
    readonly kinds: Set<B3ReportKind>;
    readonly operations: ParsedOperation[];
    readonly positionAdjustments: ParsedPositionAdjustment[];
    readonly fixedIncome: ParsedFixedIncome[];
    readonly ignored: IgnoredLine[];
    readonly rejected: RejectedLine[];
}

function merge<T>(collected: Collected<T>, target: T[], accumulator: Accumulator): void {
    target.push(...collected.items);
    accumulator.ignored.push(...collected.ignored);
    accumulator.rejected.push(...collected.rejected);
}

function absorb(sheet: B3Sheet, accumulator: Accumulator): void {
    if (sheet.kind === 'negotiation') {
        accumulator.kinds.add(B3_REPORT_KINDS.negotiation);
        merge(parseNegotiation(sheet.table, sheet.match), accumulator.operations, accumulator);
        return;
    }
    if (sheet.kind === 'movement') {
        accumulator.kinds.add(B3_REPORT_KINDS.movement);
        merge(parseMovements(sheet.table, sheet.match), accumulator.operations, accumulator);
        return;
    }
    accumulator.kinds.add(B3_REPORT_KINDS.position);
    if (sheet.kind === 'fixedIncome') {
        merge(parseFixedIncome(sheet.table, sheet.match), accumulator.fixedIncome, accumulator);
        return;
    }
    merge(parsePositions(sheet), accumulator.positionAdjustments, accumulator);
}

function emptyAccumulator(): Accumulator {
    return {
        kinds: new Set<B3ReportKind>(),
        operations: [],
        positionAdjustments: [],
        fixedIncome: [],
        ignored: [],
        rejected: []
    };
}

function statementOf(accumulator: Accumulator): ParsedInvestmentStatement {
    return {
        source: PARSED_SOURCES.b3,
        reportKinds: [...accumulator.kinds],
        currency: 'BRL',
        operations: accumulator.operations,
        positionAdjustments: accumulator.positionAdjustments,
        fixedIncome: accumulator.fixedIncome,
        ignored: accumulator.ignored,
        rejected: accumulator.rejected,
        notes: []
    };
}

export function parseB3Tables(tables: readonly RawTable[]): ParsedInvestmentStatement {
    const accumulator: Accumulator = emptyAccumulator();
    for (const table of tables) {
        const sheet: B3Sheet | null = detectB3Sheet(table);
        if (sheet !== null) {
            absorb(sheet, accumulator);
        }
    }
    if (accumulator.kinds.size === 0) {
        throw new FormatNotRecognizedError(null);
    }
    return statementOf(accumulator);
}

export function markAlreadyImported(statement: ParsedInvestmentStatement, knownKeys: ReadonlySet<string>): ParsedInvestmentStatement {
    return {
        ...statement,
        operations: statement.operations.map((operation: ParsedOperation): ParsedOperation => ({
            ...operation,
            alreadyImported: operation.kind === 'buy' || operation.kind === 'sell' ? knownKeys.has(operation.matchKey) : false
        }))
    };
}
