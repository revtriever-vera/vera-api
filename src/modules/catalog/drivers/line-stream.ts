import { TextDecoder } from 'node:util';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';

function isByteStream(value: unknown): value is AsyncIterable<Uint8Array> {
    return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

async function* chunksOf(body: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
    try {
        yield* body;
    } catch {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.unreachable);
    }
}

export async function* linesOf(response: Response, encoding: string): AsyncGenerator<string> {
    const body: unknown = response.body;
    if (!isByteStream(body)) {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
    }
    const decoder: TextDecoder = new TextDecoder(encoding);
    let pending: string = '';
    for await (const chunk of chunksOf(body)) {
        const parts: string[] = (pending + decoder.decode(chunk, { stream: true })).split(/\r?\n/);
        pending = parts.pop() ?? '';
        yield* parts;
    }
    pending += decoder.decode();
    if (pending !== '') {
        yield pending;
    }
}

export function columnIndexes(header: string, required: readonly string[]): ReadonlyMap<string, number> {
    const names: string[] = header
        .replace(/^\p{Cf}/u, '')
        .split(';')
        .map((name: string) => name.trim());
    const indexes: Map<string, number> = new Map<string, number>(
        names.map((name: string, index: number): [string, number] => [name, index])
    );
    if (required.some((name: string) => !indexes.has(name))) {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
    }
    return indexes;
}

export function cell(columns: readonly string[], indexes: ReadonlyMap<string, number>, name: string): string {
    const index: number | undefined = indexes.get(name);
    return index === undefined ? '' : (columns[index] ?? '').trim();
}
