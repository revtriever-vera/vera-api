import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { cell, columnIndexes, linesOf } from '../drivers/line-stream';
import { fetchSource, sourceErrorOfStatus } from '../drivers/source-fetch';

export interface TesouroBond {
    readonly typeName: string;
    readonly maturityDate: string;
    readonly baseDate: string;
    readonly baseUnitPrice: string | null;
    readonly buyUnitPrice: string | null;
    readonly sellUnitPrice: string | null;
}

export type TesouroReadResult =
    { readonly changed: false } | { readonly changed: true; readonly baseDate: string; readonly bonds: readonly TesouroBond[] };

export interface TesouroReadOptions {
    readonly ignoreCache?: boolean;
}

const HTTP_NOT_MODIFIED: number = 304;
const REQUIRED_COLUMNS: readonly string[] = ['Tipo Titulo', 'Data Vencimento', 'Data Base', 'PU Base Manha'];
const DATE_PATTERN: RegExp = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function isoDateOf(brazilian: string): string | null {
    const match: RegExpExecArray | null = DATE_PATTERN.exec(brazilian);
    return match ? `${match[3] ?? ''}-${match[2] ?? ''}-${match[1] ?? ''}` : null;
}

export function decimalOf(brazilian: string): string | null {
    const normalized: string = brazilian.replace(/\./g, '').replace(',', '.');
    return /^\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

class LatestBondCollector {
    private latest: string = '';
    private bonds: TesouroBond[] = [];

    public offer(bond: TesouroBond | null): void {
        if (bond === null || bond.baseDate < this.latest) {
            return;
        }
        if (bond.baseDate > this.latest) {
            this.latest = bond.baseDate;
            this.bonds = [];
        }
        this.bonds.push(bond);
    }

    public result(): TesouroReadResult {
        if (this.latest === '') {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
        }
        return { changed: true, baseDate: this.latest, bonds: this.bonds };
    }
}

@Injectable()
export class TesouroCsvReaderService {
    private etag: string | null = null;
    private lastModified: string | null = null;

    public constructor(@Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>) {}

    public async readLatest(options: TesouroReadOptions = {}): Promise<TesouroReadResult> {
        const url: string | undefined = this.config.TESOURO_PRICES_CSV_URL;
        if (url === undefined) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
        }
        const response: Response = await fetchSource(url, this.conditionalHeaders(options), this.config.CATALOG_HTTP_TIMEOUT_MS);
        if (response.status === HTTP_NOT_MODIFIED) {
            return { changed: false };
        }
        if (!response.ok) {
            throw sourceErrorOfStatus(response.status);
        }
        const result: TesouroReadResult = await this.parse(response);
        this.etag = response.headers.get('etag');
        this.lastModified = response.headers.get('last-modified');
        return result;
    }

    private conditionalHeaders(options: TesouroReadOptions): Record<string, string> {
        if (options.ignoreCache === true) {
            return {};
        }
        return {
            ...(this.etag === null ? {} : { 'If-None-Match': this.etag }),
            ...(this.lastModified === null ? {} : { 'If-Modified-Since': this.lastModified })
        };
    }

    private async parse(response: Response): Promise<TesouroReadResult> {
        let indexes: ReadonlyMap<string, number> | null = null;
        const collector: LatestBondCollector = new LatestBondCollector();
        for await (const line of linesOf(response, 'utf-8')) {
            if (line.trim() === '') {
                continue;
            }
            if (indexes === null) {
                indexes = columnIndexes(line, REQUIRED_COLUMNS);
                continue;
            }
            collector.offer(this.bondOf(line.split(';'), indexes));
        }
        return collector.result();
    }

    private bondOf(columns: readonly string[], indexes: ReadonlyMap<string, number>): TesouroBond | null {
        const maturityDate: string | null = isoDateOf(cell(columns, indexes, 'Data Vencimento'));
        const baseDate: string | null = isoDateOf(cell(columns, indexes, 'Data Base'));
        const typeName: string = cell(columns, indexes, 'Tipo Titulo');
        if (maturityDate === null || baseDate === null || typeName === '') {
            return null;
        }
        return {
            typeName,
            maturityDate,
            baseDate,
            baseUnitPrice: decimalOf(cell(columns, indexes, 'PU Base Manha')),
            buyUnitPrice: decimalOf(cell(columns, indexes, 'PU Compra Manha')),
            sellUnitPrice: decimalOf(cell(columns, indexes, 'PU Venda Manha'))
        };
    }
}
