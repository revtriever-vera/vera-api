export function decimalPlaces(value: string): number {
    const separator: number = value.indexOf('.');
    return separator === -1 ? 0 : value.length - separator - 1;
}

export function fitsDecimals(value: string, allowedDecimals: number): boolean {
    return decimalPlaces(value) <= allowedDecimals;
}

export function normalizeDecimal(value: string): string {
    if (!value.includes('.')) {
        return value;
    }
    return value.replace(/0+$/, '').replace(/\.$/, '');
}
