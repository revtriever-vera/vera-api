import { FILE_NAME_MAX_LENGTH } from './statement-import.types';

const CONTROL_CHARACTERS: RegExp = /\p{Cc}/gu;
const FALLBACK_NAME: string = 'statement';

export function sanitizeFileName(raw: string): string {
    const base: string = raw.split(/[\\/]/).pop() ?? '';
    const cleaned: string = base.replace(CONTROL_CHARACTERS, '').trim().slice(0, FILE_NAME_MAX_LENGTH);
    return cleaned === '' ? FALLBACK_NAME : cleaned;
}
