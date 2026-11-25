import { OperationInput } from '../../positions/services/position-operations.service';
import { EditedLine, POSITION_MODES } from '../domain/investment-import.types';
import { grossOf } from '../domain/line-evaluation';

const NO_PRICE: string = '0';
const EVENT_KINDS: ReadonlySet<string> = new Set(['split', 'reverse_split']);

function costOf(edited: EditedLine): Pick<OperationInput, 'quantity' | 'unitPrice' | 'grossMinor' | 'feesMinor' | 'currency'> {
    const { line } = edited;
    return {
        quantity: line.quantity,
        unitPrice: line.unitPrice ?? NO_PRICE,
        grossMinor: grossOf(edited),
        feesMinor: edited.feesMinor,
        currency: line.currency
    };
}

export function operationOf(edited: EditedLine, assetId: string): OperationInput {
    const { line } = edited;
    return {
        ...costOf(edited),
        assetId,
        kind: line.kind,
        incomeKind: line.incomeKind,
        direction: EVENT_KINDS.has(line.kind) ? line.direction : null,
        tradeDate: line.tradeDate,
        settlementDate: null,
        lineNumber: line.lineNumber,
        withheldTaxMinor: null,
        fxRate: null,
        grossBrlMinor: null,
        dayTrade: false,
        historyOnly: edited.positionMode === POSITION_MODES.historyOnly,
        sourceRef: line.sourceRef
    };
}
