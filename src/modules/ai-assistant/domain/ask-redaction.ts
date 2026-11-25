import { AskVeraTurn } from './ask-vera.types';

export const REDACTED: string = '[dado removido]';

const EDGE_START: string = String.raw`(?<![\p{L}\p{N}_])`;
const EDGE_END: string = String.raw`(?![\p{L}\p{N}_])`;
const DIGITS_ONLY: RegExp = /\D/g;

const EMAIL: RegExp = /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){1,5}/gu;
const PIX_RANDOM_KEY: RegExp = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const CNPJ_FORMATTED: RegExp = new RegExp(String.raw`${EDGE_START}\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}${EDGE_END}`, 'gu');
const CPF_FORMATTED: RegExp = new RegExp(String.raw`${EDGE_START}\d{3}\.\d{3}\.\d{3}-\d{2}${EDGE_END}`, 'gu');
const CNPJ_BARE: RegExp = new RegExp(String.raw`${EDGE_START}\d{14}${EDGE_END}`, 'gu');
const CPF_BARE: RegExp = new RegExp(String.raw`${EDGE_START}\d{11}${EDGE_END}`, 'gu');
const CARD: RegExp = new RegExp(String.raw`${EDGE_START}\d(?:[ -]?\d){12,18}${EDGE_END}`, 'gu');
const CEP: RegExp = new RegExp(String.raw`${EDGE_START}(?:\d{5}-\d{3}|(?<=cep:?\s?)\d{8})${EDGE_END}`, 'giu');
const PHONES: readonly RegExp[] = [
    new RegExp(String.raw`\+\d{1,3}[\s-]?\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}${EDGE_END}`, 'gu'),
    new RegExp(String.raw`\(\d{2}\)\s?9?\d{4}[-\s]?\d{4}${EDGE_END}`, 'gu'),
    new RegExp(String.raw`${EDGE_START}\d{2}\s?9\d{4}-?\d{4}${EDGE_END}`, 'gu'),
    new RegExp(String.raw`${EDGE_START}\d{2}9\d{8}${EDGE_END}`, 'gu')
];

function digitsOf(value: string): number[] {
    return Array.from(value.replace(DIGITS_ONLY, ''), Number);
}

function checkDigit(digits: readonly number[], weights: readonly number[]): number {
    const sum: number = weights.reduce((total: number, weight: number, index: number): number => total + weight * (digits[index] ?? 0), 0);
    const rest: number = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
}

function validCpf(value: string): boolean {
    const digits: number[] = digitsOf(value);
    const first: number = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second: number = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.length === 11 && new Set(digits).size > 1 && digits[9] === first && digits[10] === second;
}

function validCnpj(value: string): boolean {
    const digits: number[] = digitsOf(value);
    const first: number = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second: number = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.length === 14 && digits[12] === first && digits[13] === second;
}

export function luhnValid(value: string): boolean {
    const digits: number[] = digitsOf(value).reverse();
    const sum: number = digits.reduce((total: number, digit: number, index: number): number => {
        const doubled: number = index % 2 === 1 ? digit * 2 : digit;
        return total + (doubled > 9 ? doubled - 9 : doubled);
    }, 0);
    return digits.length >= 13 && sum % 10 === 0;
}

function maskAll(text: string, pattern: RegExp): string {
    return text.replace(pattern, REDACTED);
}

function maskWhen(text: string, pattern: RegExp, valid: (candidate: string) => boolean): string {
    return text.replace(pattern, (candidate: string): string => (valid(candidate) ? REDACTED : candidate));
}

export function redactPersonalData(text: string): string {
    let masked: string = maskAll(text, EMAIL);
    masked = maskAll(masked, PIX_RANDOM_KEY);
    masked = maskAll(masked, CNPJ_FORMATTED);
    masked = maskWhen(masked, CNPJ_BARE, validCnpj);
    masked = maskWhen(masked, CARD, luhnValid);
    masked = maskAll(masked, CPF_FORMATTED);
    masked = maskWhen(masked, CPF_BARE, validCpf);
    masked = maskAll(masked, CEP);
    return PHONES.reduce((rest: string, pattern: RegExp): string => maskAll(rest, pattern), masked);
}

export function redactTurns(turns: readonly AskVeraTurn[]): readonly AskVeraTurn[] {
    return turns.map((turn: AskVeraTurn): AskVeraTurn => ({ ...turn, text: redactPersonalData(turn.text) }));
}
