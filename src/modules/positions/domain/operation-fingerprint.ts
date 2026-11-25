import { createHash } from 'node:crypto';
import { normalizeDecimal } from './quantity';
import { OperationInput } from './investment-operations.types';

export function operationFingerprint(holderUserId: string | null, operation: OperationInput): string {
    const fields: (string | number | null)[] = [
        holderUserId,
        operation.assetId,
        operation.kind,
        operation.incomeKind,
        operation.tradeDate,
        normalizeDecimal(operation.quantity),
        normalizeDecimal(operation.unitPrice),
        operation.grossMinor,
        operation.feesMinor,
        operation.sourceRef
    ];
    return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

const MAX_FILE_NAME_LENGTH: number = 255;
const CONTROL_CHARACTERS: RegExp = /\p{Cc}/gu;

export function cleanFileName(raw: string): string {
    const base: string = raw.split(/[\\/]/).pop() ?? '';
    return base.replace(CONTROL_CHARACTERS, '').trim().slice(0, MAX_FILE_NAME_LENGTH);
}
