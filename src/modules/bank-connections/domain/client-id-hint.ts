import { HINT_EDGE_LENGTH } from './bank-connections.types';

const ELLIPSIS: string = '…';
const MIN_REVEALING_LENGTH: number = HINT_EDGE_LENGTH * 3;

export function hintOf(value: string): string {
    if (value.length < MIN_REVEALING_LENGTH) {
        return ELLIPSIS;
    }
    return `${value.slice(0, HINT_EDGE_LENGTH)}${ELLIPSIS}${value.slice(-HINT_EDGE_LENGTH)}`;
}
