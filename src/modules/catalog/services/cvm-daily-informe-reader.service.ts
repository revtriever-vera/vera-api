import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { digitsOf, seriesKeyOf } from '../drivers/cvm-csv';
import { byteStreamOf, cell, columnIndexes, linesOfBytes } from '../drivers/line-stream';
import { fetchSource, sourceErrorOfStatus } from '../drivers/source-fetch';
import { firstZipEntryStream } from '../drivers/zip-stream';
import { CatalogLogService } from './catalog-log.service';

export interface DailyQuote {
    readonly date: string;
    readonly quota: string;
}

export type MonthlySeries = ReadonlyMap<string, DailyQuote>;

interface CachedMonth {
    readonly etag: string;
    readonly series: MonthlySeries;
}

const HTTP_NOT_FOUND: number = 404;
const HTTP_NOT_MODIFIED: number = 304;
const MAX_CACHED_MONTHS: number = 4;
const REQUIRED_COLUMNS: readonly string[] = ['DT_COMPTC', 'VL_QUOTA'];
const CNPJ_COLUMNS: readonly string[] = ['CNPJ_FUNDO_CLASSE', 'CNPJ_FUNDO'];
const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;
const QUOTA_PATTERN: RegExp = /^\d+(\.\d+)?$/;
const INFORME_PATH: string = 'FI/DOC/INF_DIARIO/DADOS';
const ENCODING: string = 'windows-1252';

function cnpjColumnOf(indexes: ReadonlyMap<string, number>): string {
    const column: string | undefined = CNPJ_COLUMNS.find((name: string): boolean => indexes.has(name));
    if (column === undefined) {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
    }
    return column;
}

class LatestQuotes {
    private readonly latest: Map<string, DailyQuote> = new Map<string, DailyQuote>();
    private count: number = 0;

    public get rows(): number {
        return this.count;
    }

    public offer(key: string, quote: DailyQuote): void {
        this.count += 1;
        const previous: DailyQuote | undefined = this.latest.get(key);
        if (previous === undefined || quote.date >= previous.date) {
            this.latest.set(key, quote);
        }
    }

    public result(): MonthlySeries {
        return this.latest;
    }
}

class QuoteLineReader {
    public readonly quotes: LatestQuotes = new LatestQuotes();
    private indexes: ReadonlyMap<string, number> | null = null;
    private cnpjColumn: string = '';

    public accept(line: string): void {
        if (line.trim() === '') {
            return;
        }
        if (this.indexes === null) {
            this.indexes = columnIndexes(line, REQUIRED_COLUMNS);
            this.cnpjColumn = cnpjColumnOf(this.indexes);
            return;
        }
        this.offerRow(line.split(';'), this.indexes);
    }

    public finish(): LatestQuotes {
        if (this.indexes === null) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
        }
        return this.quotes;
    }

    private offerRow(columns: readonly string[], indexes: ReadonlyMap<string, number>): void {
        const date: string = cell(columns, indexes, 'DT_COMPTC');
        const quota: string = cell(columns, indexes, 'VL_QUOTA');
        const cnpj: string = digitsOf(cell(columns, indexes, this.cnpjColumn));
        if (cnpj === '' || !DATE_PATTERN.test(date) || !QUOTA_PATTERN.test(quota)) {
            return;
        }
        this.quotes.offer(seriesKeyOf(cnpj, cell(columns, indexes, 'ID_SUBCLASSE')), { date, quota });
    }
}

function newest(quotes: Map<string, DailyQuote>, series: MonthlySeries, key: string): void {
    const quote: DailyQuote | undefined = series.get(key);
    const previous: DailyQuote | undefined = quotes.get(key);
    if (quote !== undefined && (previous === undefined || quote.date >= previous.date)) {
        quotes.set(key, quote);
    }
}

@Injectable()
export class CvmDailyInformeReaderService {
    private readonly cache: Map<string, CachedMonth> = new Map<string, CachedMonth>();

    public constructor(
        @Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>,
        private readonly logs: CatalogLogService
    ) {}

    public async seriesKeys(months: readonly string[]): Promise<ReadonlySet<string>> {
        const keys: Set<string> = new Set<string>();
        for (const month of months) {
            const series: MonthlySeries = await this.readMonth(month);
            [...series.keys()].forEach((key: string): Set<string> => keys.add(key));
        }
        return keys;
    }

    public async latestQuotes(months: readonly string[], keys: ReadonlySet<string>): Promise<ReadonlyMap<string, DailyQuote>> {
        const quotes: Map<string, DailyQuote> = new Map<string, DailyQuote>();
        const wanted: string[] = [...keys];
        for (const month of months) {
            const series: MonthlySeries = await this.readMonth(month);
            wanted.forEach((key: string): void => {
                newest(quotes, series, key);
            });
        }
        return quotes;
    }

    private async readMonth(month: string): Promise<MonthlySeries> {
        const startedAt: number = Date.now();
        const cached: CachedMonth | undefined = this.cache.get(month);
        const response: Response = await fetchSource(
            this.urlOf(month),
            this.conditionalHeaders(cached),
            this.config.CATALOG_HTTP_TIMEOUT_MS
        );
        if (response.status === HTTP_NOT_MODIFIED && cached !== undefined) {
            this.logs.informeRead(month, true, 0, Date.now() - startedAt);
            return cached.series;
        }
        if (response.status === HTTP_NOT_FOUND) {
            this.cache.delete(month);
            this.logs.informeRead(month, false, 0, Date.now() - startedAt);
            return new Map<string, DailyQuote>();
        }
        return this.readFresh(month, response, startedAt);
    }

    private async readFresh(month: string, response: Response, startedAt: number): Promise<MonthlySeries> {
        if (!response.ok) {
            throw sourceErrorOfStatus(response.status);
        }
        const quotes: LatestQuotes = await this.parse(response);
        this.remember(month, response.headers.get('etag'), quotes.result());
        this.logs.informeRead(month, false, quotes.rows, Date.now() - startedAt);
        return quotes.result();
    }

    private urlOf(month: string): string {
        return `${this.config.CVM_DATA_BASE_URL}/${INFORME_PATH}/inf_diario_fi_${month}.zip`;
    }

    private conditionalHeaders(cached: CachedMonth | undefined): Record<string, string> {
        return cached === undefined ? {} : { 'If-None-Match': cached.etag };
    }

    private remember(month: string, etag: string | null, series: MonthlySeries): void {
        this.cache.delete(month);
        if (etag === null) {
            return;
        }
        this.cache.set(month, { etag, series });
        for (const oldest of [...this.cache.keys()].slice(0, Math.max(0, this.cache.size - MAX_CACHED_MONTHS))) {
            this.cache.delete(oldest);
        }
    }

    private async parse(response: Response): Promise<LatestQuotes> {
        const reader: QuoteLineReader = new QuoteLineReader();
        for await (const line of linesOfBytes(firstZipEntryStream(byteStreamOf(response)), ENCODING)) {
            reader.accept(line);
        }
        return reader.finish();
    }
}
