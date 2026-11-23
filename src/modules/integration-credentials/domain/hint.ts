import { HINT_LENGTH } from './integration.types';

const ELLIPSIS: string = '…';

export function hintOf(secret: string): string {
    if (secret.length <= HINT_LENGTH * 2) {
        return ELLIPSIS;
    }
    return `${ELLIPSIS}${secret.slice(-HINT_LENGTH)}`;
}
