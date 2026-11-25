function digitsOf(value: string): number[] {
    return value
        .replace(/\D/g, '')
        .split('')
        .map((digit: string): number => Number(digit));
}

function checkDigit(digits: readonly number[], weights: readonly number[]): number {
    const sum: number = weights.reduce((total: number, weight: number, index: number): number => total + weight * (digits[index] ?? 0), 0);
    const rest: number = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
}

function cpfWeights(length: number): number[] {
    return Array.from({ length }, (_: unknown, index: number): number => length + 1 - index);
}

const CNPJ_FIRST_WEIGHTS: readonly number[] = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_SECOND_WEIGHTS: readonly number[] = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function isValidCpf(value: string): boolean {
    const digits: number[] = digitsOf(value);
    if (digits.length !== 11 || new Set(digits).size === 1) {
        return false;
    }
    return checkDigit(digits, cpfWeights(9)) === digits[9] && checkDigit(digits, cpfWeights(10)) === digits[10];
}

export function isValidCnpj(value: string): boolean {
    const digits: number[] = digitsOf(value);
    if (digits.length !== 14 || new Set(digits).size === 1) {
        return false;
    }
    return checkDigit(digits, CNPJ_FIRST_WEIGHTS) === digits[12] && checkDigit(digits, CNPJ_SECOND_WEIGHTS) === digits[13];
}

export function findCpfLikeNumbers(text: string): string[] {
    const matches: RegExpMatchArray | null = text.match(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g);
    return matches === null ? [] : [...matches];
}
