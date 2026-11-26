import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { digitsOf } from '../drivers/cvm-csv';
import { byteStreamOf, cell, columnIndexes, linesOfBytes } from '../drivers/line-stream';
import { fetchSource, sourceErrorOfStatus } from '../drivers/source-fetch';
import { firstZipEntryStream } from '../drivers/zip-stream';

export interface IpeDocument {
    readonly cnpj: string;
    readonly category: string;
    readonly type: string;
    readonly species: string;
    readonly subject: string;
    readonly referenceDate: string;
    readonly deliveryDate: string;
    readonly version: number;
    readonly sequence: number;
    readonly url: string;
}

export interface IpeWindow {
    readonly today: string;
    readonly deliveredSince: string;
}

interface CachedYear {
    readonly etag: string | null;
    readonly checkedAt: number;
    readonly documents: readonly IpeDocument[];
}

const HTTP_NOT_FOUND: number = 404;
const HTTP_NOT_MODIFIED: number = 304;
const FRESH_MS: number = 60 * 60 * 1000;
const IPE_PATH: string = 'CIA_ABERTA/DOC/IPE/DADOS';
const ENCODING: string = 'windows-1252';
const REQUIRED_COLUMNS: readonly string[] = ['CNPJ_Companhia', 'Data_Referencia', 'Categoria', 'Data_Entrega', 'Versao', 'Link_Download'];
const CATEGORIES: ReadonlySet<string> = new Set<string>(['Aviso aos Acionistas', 'Comunicado ao Mercado', 'Assembleia']);
const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;
const CNPJ_LENGTH: number = 14;
const SEQUENCE_PATTERN: RegExp = /numSequencia=(\d+)/;

function yearsOf(window: IpeWindow): string[] {
    const first: number = Number(window.deliveredSince.slice(0, 4));
    const last: number = Number(window.today.slice(0, 4));
    return Array.from({ length: Math.max(1, last - first + 1) }, (_unused: unknown, index: number): string => String(first + index));
}

function wellFormed(document: IpeDocument): boolean {
    return (
        CATEGORIES.has(document.category) &&
        document.cnpj.length === CNPJ_LENGTH &&
        Number.isInteger(document.sequence) &&
        document.sequence > 0 &&
        DATE_PATTERN.test(document.referenceDate) &&
        DATE_PATTERN.test(document.deliveryDate)
    );
}

function documentOf(columns: readonly string[], indexes: ReadonlyMap<string, number>): IpeDocument | null {
    const url: string = cell(columns, indexes, 'Link_Download');
    const document: IpeDocument = {
        cnpj: digitsOf(cell(columns, indexes, 'CNPJ_Companhia')),
        category: cell(columns, indexes, 'Categoria'),
        type: cell(columns, indexes, 'Tipo'),
        species: cell(columns, indexes, 'Especie'),
        subject: cell(columns, indexes, 'Assunto'),
        referenceDate: cell(columns, indexes, 'Data_Referencia'),
        deliveryDate: cell(columns, indexes, 'Data_Entrega'),
        version: Number(cell(columns, indexes, 'Versao')) || 0,
        sequence: Number(SEQUENCE_PATTERN.exec(url)?.[1] ?? ''),
        url
    };
    return wellFormed(document) ? document : null;
}

function isWanted(document: IpeDocument, window: IpeWindow): boolean {
    return document.deliveryDate >= window.deliveredSince || document.referenceDate >= window.today;
}

function rowOf(line: string, indexes: ReadonlyMap<string, number>, window: IpeWindow): IpeDocument[] {
    const document: IpeDocument | null = documentOf(line.split(';'), indexes);
    return document !== null && isWanted(document, window) ? [document] : [];
}

@Injectable()
export class CvmIpeReaderService {
    private readonly cache: Map<string, CachedYear> = new Map<string, CachedYear>();

    public constructor(@Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>) {}

    public async documents(window: IpeWindow): Promise<readonly IpeDocument[]> {
        const documents: IpeDocument[] = [];
        for (const year of yearsOf(window)) {
            documents.push(...(await this.readYear(year, window)));
        }
        return documents.filter((document: IpeDocument): boolean => isWanted(document, window));
    }

    private async readYear(year: string, window: IpeWindow): Promise<readonly IpeDocument[]> {
        const cached: CachedYear | undefined = this.cache.get(year);
        if (cached !== undefined && Date.now() - cached.checkedAt < FRESH_MS) {
            return cached.documents;
        }
        const response: Response = await fetchSource(
            this.urlOf(year),
            this.conditionalHeaders(cached),
            this.config.CATALOG_HTTP_TIMEOUT_MS
        );
        return this.accept(year, response, cached, window);
    }

    private async accept(
        year: string,
        response: Response,
        cached: CachedYear | undefined,
        window: IpeWindow
    ): Promise<readonly IpeDocument[]> {
        if (response.status === HTTP_NOT_MODIFIED && cached !== undefined) {
            this.cache.set(year, { ...cached, checkedAt: Date.now() });
            return cached.documents;
        }
        if (response.status === HTTP_NOT_FOUND) {
            this.cache.delete(year);
            return [];
        }
        if (!response.ok) {
            throw sourceErrorOfStatus(response.status);
        }
        const documents: IpeDocument[] = await this.parse(response, window);
        this.cache.set(year, { etag: response.headers.get('etag'), checkedAt: Date.now(), documents });
        return documents;
    }

    private urlOf(year: string): string {
        return `${this.config.CVM_DATA_BASE_URL}/${IPE_PATH}/ipe_cia_aberta_${year}.zip`;
    }

    private conditionalHeaders(cached: CachedYear | undefined): Record<string, string> {
        return cached?.etag === undefined || cached.etag === null ? {} : { 'If-None-Match': cached.etag };
    }

    private async parse(response: Response, window: IpeWindow): Promise<IpeDocument[]> {
        const documents: IpeDocument[] = [];
        let indexes: ReadonlyMap<string, number> | null = null;
        for await (const line of linesOfBytes(firstZipEntryStream(byteStreamOf(response)), ENCODING)) {
            indexes ??= columnIndexes(line, REQUIRED_COLUMNS);
            documents.push(...rowOf(line, indexes, window));
        }
        if (indexes === null) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
        }
        return documents;
    }
}
