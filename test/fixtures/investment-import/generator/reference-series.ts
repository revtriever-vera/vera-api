export const CDI_ANNUAL_PERCENT_BY_YEAR: Readonly<Record<number, readonly number[]>> = {
    2023: [13.65, 13.65, 13.65, 13.65, 13.65, 13.65, 13.65, 13.15, 12.65, 12.65, 12.15, 11.65],
    2024: [11.65, 11.15, 10.65, 10.65, 10.4, 10.4, 10.4, 10.4, 10.65, 10.9, 10.9, 11.15],
    2025: [11.15, 13.15, 13.4, 14.15, 14.4, 14.9, 14.9, 14.9, 14.9, 14.9, 14.9, 14.9],
    2026: [14.9, 14.9, 14.9, 14.4, 14.4, 14.4, 14.4, 14.15, 14.15, 14.15, 14.15, 14.15]
};

export const IPCA_MONTHLY_PERCENT_BY_YEAR: Readonly<Record<number, readonly number[]>> = {
    2023: [0.53, 0.84, 0.71, 0.61, 0.23, -0.08, 0.12, 0.23, 0.26, 0.24, 0.28, 0.56],
    2024: [0.42, 0.83, 0.16, 0.38, 0.46, 0.21, 0.38, -0.02, 0.44, 0.56, 0.39, 0.52],
    2025: [0.16, 1.31, 0.56, 0.43, 0.26, 0.24, 0.26, -0.11, 0.48, 0.09, 0.18, 0.33],
    2026: [0.33, 0.7, 0.48, 0.41, 0.22, 0.19, 0.25, 0.1, 0.4, 0.2, 0.2, 0.3]
};

export function cdiAnnualPercent(year: number, month: number): number {
    return CDI_ANNUAL_PERCENT_BY_YEAR[year]?.[month - 1] ?? 0;
}

export function ipcaMonthlyPercent(year: number, month: number): number {
    return IPCA_MONTHLY_PERCENT_BY_YEAR[year]?.[month - 1] ?? 0;
}
