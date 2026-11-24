import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { decodeCsv } from './cvm-csv';
import { fetchSource, sourceErrorOfStatus } from './source-fetch';
import { zipEntryContent } from './zip-archive';

const HTTP_NOT_FOUND: number = 404;
const MONTHS_LOOKBACK: number = 3;
const MONTH_PAD: number = 2;

export interface DatasetClient {
    readonly baseUrl: string;
    readonly timeoutMs: number;
}

async function download(client: DatasetClient, path: string): Promise<Buffer | null> {
    const response: Response = await fetchSource(`${client.baseUrl}/${path}`, {}, client.timeoutMs);
    if (response.status === HTTP_NOT_FOUND) {
        return null;
    }
    if (!response.ok) {
        throw sourceErrorOfStatus(response.status);
    }
    try {
        return Buffer.from(await response.arrayBuffer());
    } catch {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.unreachable);
    }
}

export async function zippedCsv(client: DatasetClient, path: string, entry: string): Promise<string | null> {
    const archive: Buffer | null = await download(client, path);
    return archive === null ? null : decodeCsv(zipEntryContent(archive, entry));
}

export async function requiredZippedCsv(client: DatasetClient, path: string, entry: string): Promise<string> {
    const text: string | null = await zippedCsv(client, path, entry);
    if (text === null) {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
    }
    return text;
}

export async function requiredZippedCsvs(client: DatasetClient, path: string, entries: readonly string[]): Promise<string[]> {
    const archive: Buffer | null = await download(client, path);
    if (archive === null) {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
    }
    return entries.map((entry: string): string => decodeCsv(zipEntryContent(archive, entry)));
}

export function recentYears(today: string, count: number): string[] {
    const year: number = Number(today.slice(0, 4));
    return Array.from({ length: count }, (_unused: unknown, back: number): string => String(year - back));
}

export function recentMonths(today: string): string[] {
    const year: number = Number(today.slice(0, 4));
    const month: number = Number(today.slice(5, 7));
    return Array.from({ length: MONTHS_LOOKBACK + 1 }, (_unused: unknown, back: number): string => {
        const index: number = year * 12 + (month - 1) - back;
        return `${String(Math.floor(index / 12))}${String((index % 12) + 1).padStart(MONTH_PAD, '0')}`;
    });
}

export async function latestMonthlyCsv(
    client: DatasetClient,
    months: readonly string[],
    pathOf: (month: string) => string,
    entryOf: (month: string) => string
): Promise<string> {
    for (const month of months) {
        const text: string | null = await zippedCsv(client, pathOf(month), entryOf(month));
        if (text !== null) {
            return text;
        }
    }
    throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
}

export async function yearlyCsvs(
    client: DatasetClient,
    years: readonly string[],
    pathOf: (year: string) => string,
    entryOf: (year: string) => string
): Promise<string[]> {
    const texts: string[] = [];
    for (const year of years) {
        const text: string | null = await zippedCsv(client, pathOf(year), entryOf(year));
        if (text !== null) {
            texts.push(text);
        }
    }
    if (texts.length === 0) {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
    }
    return texts;
}

const FIRST_BUSINESS_DAYS: number = 5;
const SUNDAY: number = 0;
const SATURDAY: number = 6;

function businessDayOfMonth(today: string): number {
    const day: number = Number(today.slice(8, 10));
    let count: number = 0;
    for (let current: number = 1; current <= day; current += 1) {
        const weekday: number = new Date(`${today.slice(0, 8)}${String(current).padStart(MONTH_PAD, '0')}T12:00:00Z`).getUTCDay();
        count += weekday === SUNDAY || weekday === SATURDAY ? 0 : 1;
    }
    return count;
}

export function informeMonths(today: string): string[] {
    const [current, previous]: string[] = recentMonths(today);
    return businessDayOfMonth(today) <= FIRST_BUSINESS_DAYS ? [current ?? '', previous ?? ''] : [current ?? ''];
}
