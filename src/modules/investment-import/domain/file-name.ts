const MAX_FILE_NAME_LENGTH: number = 120;
const CONTROL_CHARACTERS: RegExp = /\p{Cc}/gu;

export function sanitizeFileName(raw: string): string {
    const base: string = raw.split(/[\\/]/).pop() ?? '';
    return base.replace(CONTROL_CHARACTERS, '').trim().slice(0, MAX_FILE_NAME_LENGTH);
}
