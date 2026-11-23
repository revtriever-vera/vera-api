import { randomInt } from 'node:crypto';

export const LINK_CODE_ALPHABET: string = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH: number = 8;

export function generateLinkCode(): string {
    let code: string = '';
    for (let position: number = 0; position < LINK_CODE_LENGTH; position += 1) {
        code += LINK_CODE_ALPHABET.charAt(randomInt(LINK_CODE_ALPHABET.length));
    }
    return code;
}
