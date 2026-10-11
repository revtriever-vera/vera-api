import { IMPORT_FORMATS, ImportFormat, SNIFF_BYTES } from './statement-import.types';

const OFX_MARKER: RegExp = /OFXHEADER\s*[:=]|<OFX[\s>]/i;
const LAST_TEXT_CONTROL: number = 13;
const FIRST_PRINTABLE: number = 32;
const TAB: number = 9;
const COMBINING_MARKS: RegExp = /\p{M}/gu;
const NUBANK_CARD_HEADER: string = 'date,title,amount';
const NUBANK_ACCOUNT_HEADER: string = 'data,valor,identificador,descricao';

function isBinaryCode(code: number): boolean {
    return code < TAB || (code > LAST_TEXT_CONTROL && code < FIRST_PRINTABLE);
}

export function isBinary(text: string): boolean {
    const limit: number = Math.min(text.length, SNIFF_BYTES);
    for (let index: number = 0; index < limit; index += 1) {
        if (isBinaryCode(text.charCodeAt(index))) {
            return true;
        }
    }
    return false;
}

export function firstLineOf(text: string): string {
    const stripped: string = text.startsWith('﻿') ? text.slice(1) : text;
    const end: number = stripped.search(/[\r\n]/);
    return end === -1 ? stripped : stripped.slice(0, end);
}

export function headerKey(line: string): string {
    return line
        .normalize('NFD')
        .replace(COMBINING_MARKS, '')
        .replace(/["'\s]/g, '')
        .toLowerCase();
}

export function detectFormat(text: string): ImportFormat | null {
    if (isBinary(text)) {
        return null;
    }
    if (OFX_MARKER.test(text.slice(0, SNIFF_BYTES))) {
        return IMPORT_FORMATS.ofx;
    }
    const line: string = firstLineOf(text);
    const key: string = headerKey(line);
    if (key === NUBANK_CARD_HEADER) {
        return IMPORT_FORMATS.csvNubankCard;
    }
    if (key === NUBANK_ACCOUNT_HEADER) {
        return IMPORT_FORMATS.csvNubankAccount;
    }
    return line.includes(',') || line.includes(';') ? IMPORT_FORMATS.csvGeneric : null;
}
