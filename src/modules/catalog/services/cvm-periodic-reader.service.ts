import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { digitsOf } from '../drivers/cvm-csv';
import { byteStreamOf, cell, columnIndexes, linesOfBytes } from '../drivers/line-stream';
import { fetchSource, sourceErrorOfStatus } from '../drivers/source-fetch';
import { firstZipEntryStream } from '../drivers/zip-stream';

export type PeriodicKind = 'ITR' | 'DFP';
export const PERIODIC_KIND_LIST: readonly PeriodicKind[] = ['ITR', 'DFP'];

export interface PeriodicDocument {
    readonly cnpj: string;
    readonly kind: PeriodicKind;
    readonly referenceDate: string;
    readonly deliveryDate: string;
    readonly version: number;
    readonly documentId: string;
    readonly url: string;
}

export interface PeriodicWindow {
    readonly today: string;
    readonly deliveredSince: string;
}

interface CachedYear {
    readonly etag: string | null;
    readonly checkedAt: number;
    readonly deliveredSince: string;
    readonly documents: readonly PeriodicDocument[];
}

const HTTP_NOT_FOUND: number = 404;
const HTTP_NOT_MODIFIED: number = 304;
const FRESH_MS: number = 60 * 60 * 1000;
const ENCODING: string = 'windows-1252';
const REQUIRED_COLUMNS: readonly string[] = ['CNPJ_CIA', 'DT_REFER', 'VERSAO', 'CATEG_DOC', 'ID_DOC', 'DT_RECEB', 'LINK_DOC'];
const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;
const CNPJ_LENGTH: number = 14;
const KINDS: ReadonlySet<string> = new Set<string>(PERIODIC_KIND_LIST);

function yearsOf(window: PeriodicWindow): string[] {
    const first: number = Number(window.deliveredSince.slice(0, 4));
    const last: number = Number(window.today.slice(0, 4));
    return Array.from({ length: Math.max(1, last - first + 1) }, (_unused: unknown, index: number): string => String(first + index));
}

function documentOf(columns: readonly string[], indexes: ReadonlyMap<string, number>): PeriodicDocument | null {
    const kind: string = cell(columns, indexes, 'CATEG_DOC');
    const document: PeriodicDocument = {
        cnpj: digitsOf(cell(columns, indexes, 'CNPJ_CIA')),
        kind: kind as PeriodicKind,
        referenceDate: cell(columns, indexes, 'DT_REFER'),
        deliveryDate: cell(columns, indexes, 'DT_RECEB'),
        version: Number(cell(columns, indexes, 'VERSAO')) || 0,
        documentId: cell(columns, indexes, 'ID_DOC'),
        url: cell(columns, indexes, 'LINK_DOC')
    };
    const wellFormed: boolean =
        KINDS.has(kind) &&
        document.cnpj.length === CNPJ_LENGTH &&
        document.documentId !== '' &&
        DATE_PATTERN.test(document.referenceDate) &&
        DATE_PATTERN.test(document.deliveryDate);
    return wellFormed ? document : null;
}

@Injectable()
export class CvmPeriodicReaderService {
    private readonly cache: Map<string, CachedYear> = new Map<string, CachedYear>();

    public constructor(@Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>) {}

    public async documents(kind: PeriodicKind, window: PeriodicWindow): Promise<readonly PeriodicDocument[]> {
        const documents: PeriodicDocument[] = [];
        for (const year of yearsOf(window)) {
            documents.push(...(await this.readYear(kind, year, window)));
        }
        return documents.filter((document: PeriodicDocument): boolean => document.deliveryDate >= window.deliveredSince);
    }

    private async readYear(kind: PeriodicKind, year: string, window: PeriodicWindow): Promise<readonly PeriodicDocument[]> {
        const key: string = `${kind}:${year}`;
        const stored: CachedYear | undefined = this.cache.get(key);
        const cached: CachedYear | undefined = stored !== undefined && stored.deliveredSince <= window.deliveredSince ? stored : undefined;
        if (cached !== undefined && Date.now() - cached.checkedAt < FRESH_MS) {
            return cached.documents;
        }
        const headers: Record<string, string> = cached?.etag === undefined || cached.etag === null ? {} : { 'If-None-Match': cached.etag };
        const response: Response = await fetchSource(this.urlOf(kind, year), headers, this.config.CATALOG_HTTP_TIMEOUT_MS);
        return this.accept(key, response, cached, window);
    }

    private async accept(
        key: string,
        response: Response,
        cached: CachedYear | undefined,
        window: PeriodicWindow
    ): Promise<readonly PeriodicDocument[]> {
        if (response.status === HTTP_NOT_MODIFIED && cached !== undefined) {
            this.cache.set(key, { ...cached, checkedAt: Date.now() });
            return cached.documents;
        }
        if (response.status === HTTP_NOT_FOUND) {
            this.cache.delete(key);
            return [];
        }
        if (!response.ok) {
            throw sourceErrorOfStatus(response.status);
        }
        const documents: PeriodicDocument[] = await this.parse(response, window);
        this.cache.set(key, {
            etag: response.headers.get('etag'),
            checkedAt: Date.now(),
            deliveredSince: window.deliveredSince,
            documents
        });
        return documents;
    }

    private urlOf(kind: PeriodicKind, year: string): string {
        const folder: string = kind.toUpperCase();
        return `${this.config.CVM_DATA_BASE_URL}/CIA_ABERTA/DOC/${folder}/DADOS/${kind.toLowerCase()}_cia_aberta_${year}.zip`;
    }

    private async parse(response: Response, window: PeriodicWindow): Promise<PeriodicDocument[]> {
        const documents: PeriodicDocument[] = [];
        let indexes: ReadonlyMap<string, number> | null = null;
        for await (const line of linesOfBytes(firstZipEntryStream(byteStreamOf(response)), ENCODING)) {
            indexes ??= columnIndexes(line, REQUIRED_COLUMNS);
            const document: PeriodicDocument | null = documentOf(line.split(';'), indexes);
            if (document !== null && document.deliveryDate >= window.deliveredSince) {
                documents.push(document);
            }
        }
        if (indexes === null) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
        }
        return documents;
    }
}
