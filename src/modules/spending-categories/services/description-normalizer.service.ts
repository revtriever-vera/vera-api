import { Injectable } from '@nestjs/common';
import { DESCRIPTION_MAX_LENGTH } from '../domain/categories.types';

export const PAYMENT_METHOD_PREFIXES: readonly string[] = [
    'PIX ENVIADO ',
    'PIX RECEBIDO ',
    'COMPRA CARTAO ',
    'DEB AUT ',
    'PAG ',
    'PG ',
    'MP '
];

const COMBINING_MARKS: RegExp = /\p{M}/gu;
const SHORT_DATES: RegExp = /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g;
const SEPARATORS: RegExp = /[*\-/._·]/g;
const LONG_DIGIT_RUNS: RegExp = /\d{4,}/g;
const WHITESPACE: RegExp = /\s+/g;

function collapse(text: string): string {
    return text.replace(WHITESPACE, ' ').trim();
}

function withoutPaymentPrefix(text: string): string {
    const prefix: string | undefined = PAYMENT_METHOD_PREFIXES.find((candidate: string): boolean => text.startsWith(candidate));
    return prefix === undefined ? text : text.slice(prefix.length);
}

export function normalizeDescription(text: string): string {
    const plain: string = text.normalize('NFD').replace(COMBINING_MARKS, '').toUpperCase().replace(SHORT_DATES, ' ');
    const spaced: string = collapse(plain.replace(SEPARATORS, ' '));
    return collapse(withoutPaymentPrefix(spaced).replace(LONG_DIGIT_RUNS, ' ')).slice(0, DESCRIPTION_MAX_LENGTH).trim();
}

@Injectable()
export class DescriptionNormalizerService {
    public normalize(text: string): string {
        return normalizeDescription(text);
    }
}
