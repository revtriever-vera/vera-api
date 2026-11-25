import { Decimal, DecimalUtil } from '../../src/shared/utils/decimal.util';
import { CurveSeries } from '../../src/modules/fixed-income/services/index-series-math';
import { CDI_ANNUAL_PERCENT_BY_YEAR, IPCA_MONTHLY_PERCENT_BY_YEAR } from '../fixtures/investment-import/generator/reference-series';

const BUSINESS_DAYS_PER_YEAR: number = 252;
const DAY_MS: number = 86_400_000;

function isoOf(time: number): string {
    return new Date(time).toISOString().slice(0, 10);
}

function dailyCdiPercent(annualPercent: number): number {
    return ((1 + annualPercent / 100) ** (1 / BUSINESS_DAYS_PER_YEAR) - 1) * 100;
}

function cdiDates(lastDate: string): string[] {
    const dates: string[] = [];
    for (let time: number = Date.parse('2023-01-02T00:00:00Z'); isoOf(time) <= lastDate; time += DAY_MS) {
        const weekday: number = new Date(time).getUTCDay();
        if (weekday !== 0 && weekday !== 6) {
            dates.push(isoOf(time));
        }
    }
    return dates;
}

function ipcaUntil(lastMonth: string): CurveSeries['ipca'] {
    const months: string[] = [];
    const values: Decimal[] = [];
    for (const [year, monthly] of Object.entries(IPCA_MONTHLY_PERCENT_BY_YEAR)) {
        monthly.forEach((value: number, index: number): void => {
            const key: string = `${year}-${String(index + 1).padStart(2, '0')}`;
            if (key <= lastMonth) {
                months.push(key);
                values.push(DecimalUtil.of(value));
            }
        });
    }
    return { months, values };
}

function cdiRateOf(date: string): Decimal {
    const annual: number = CDI_ANNUAL_PERCENT_BY_YEAR[Number(date.slice(0, 4))]?.[Number(date.slice(5, 7)) - 1] ?? 0;
    return DecimalUtil.of(dailyCdiPercent(annual));
}

export function seriesUntil(lastCdiDate: string, lastIpcaMonth: string): CurveSeries {
    const dates: string[] = cdiDates(lastCdiDate);
    return { cdi: { dates, rates: dates.map(cdiRateOf) }, ipca: ipcaUntil(lastIpcaMonth) };
}
