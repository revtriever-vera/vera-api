import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH } from './link-code';
import { stripTrailingPunctuation } from './text-normalizer';

export const LINK_COMMAND_WORD: string = 'VINCULAR';
const LINK_COMMAND: RegExp = new RegExp(`^${LINK_COMMAND_WORD} ([${LINK_CODE_ALPHABET}]{${String(LINK_CODE_LENGTH)}})$`);

export function parseLinkMessage(text: string): string | null {
    const normalized: string = stripTrailingPunctuation(text.trim()).replaceAll(/\s+/g, ' ').toUpperCase();
    return LINK_COMMAND.exec(normalized)?.[1] ?? null;
}

export function linkTextOf(code: string): string {
    return `${LINK_COMMAND_WORD} ${code}`;
}
