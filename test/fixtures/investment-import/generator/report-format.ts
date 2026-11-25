export function brDate(isoDate: string): string {
    const [year, month, day]: string[] = isoDate.split('-');
    return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

export function money(value: number): number {
    return Math.round(value * 100) / 100;
}
