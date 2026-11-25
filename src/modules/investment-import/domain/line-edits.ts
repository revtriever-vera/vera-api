import { InvalidEditError } from './investment-import.errors';
import { EditedLine, LineEdit, StoredLine } from './investment-import.types';

const NO_EDIT: LineEdit = { lineId: '' };

function correctedOf(line: StoredLine, edit: LineEdit): StoredLine {
    return {
        ...line,
        quantity: edit.quantity ?? line.quantity,
        unitPrice: edit.unitPrice ?? line.unitPrice,
        tradeDate: edit.tradeDate ?? line.tradeDate
    };
}

function editedOf(line: StoredLine, edit: LineEdit | undefined): EditedLine {
    const given: LineEdit = edit ?? NO_EDIT;
    return {
        line: correctedOf(line, given),
        assetId: given.assetId ?? null,
        feesMinor: given.feesMinor ?? line.feesMinor,
        skip: given.skip ?? false,
        repriced: given.quantity !== undefined || given.unitPrice !== undefined,
        positionMode: given.positionMode ?? null
    };
}

function indexEdits(lines: readonly StoredLine[], edits: readonly LineEdit[]): Map<string, LineEdit> {
    const known: ReadonlySet<string> = new Set(lines.map((line: StoredLine): string => line.lineId));
    const byLine: Map<string, LineEdit> = new Map();
    for (const edit of edits) {
        if (!known.has(edit.lineId)) {
            throw new InvalidEditError(edit.lineId, 'unknown_line');
        }
        if (byLine.has(edit.lineId)) {
            throw new InvalidEditError(edit.lineId, 'repeated_line');
        }
        byLine.set(edit.lineId, edit);
    }
    return byLine;
}

export function applyEdits(lines: readonly StoredLine[], edits: readonly LineEdit[]): EditedLine[] {
    const byLine: Map<string, LineEdit> = indexEdits(lines, edits);
    return lines.map((line: StoredLine): EditedLine => editedOf(line, byLine.get(line.lineId)));
}
