import { SNIFF_BYTES } from './statement-import.types';

const UTF8_BOM: readonly number[] = [0xef, 0xbb, 0xbf];
const WINDOWS_1252_CHARSET: RegExp = /CHARSET:\s*1252/i;
const LATIN1_CHARSET: RegExp = /CHARSET:\s*(8859-?1|ISO-8859-1)/i;

function hasUtf8Bom(bytes: Uint8Array): boolean {
    return UTF8_BOM.every((value: number, index: number): boolean => bytes[index] === value);
}

function declaresLegacyCharset(bytes: Uint8Array): boolean {
    const head: string = new TextDecoder('windows-1252').decode(bytes.subarray(0, SNIFF_BYTES));
    return WINDOWS_1252_CHARSET.test(head) || LATIN1_CHARSET.test(head);
}

export function decodeStatement(bytes: Uint8Array): string {
    if (hasUtf8Bom(bytes)) {
        return new TextDecoder('utf-8').decode(bytes.subarray(UTF8_BOM.length));
    }
    if (declaresLegacyCharset(bytes)) {
        return new TextDecoder('windows-1252').decode(bytes);
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}
