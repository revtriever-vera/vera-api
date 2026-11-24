import { Inflate, createInflateRaw } from 'node:zlib';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { chunksOf } from './line-stream';

const LOCAL_HEADER_SIGNATURE: number = 0x04034b50;
const LOCAL_HEADER_SIZE: number = 30;
const METHOD_DEFLATED: number = 8;

function formatInvalid(): CatalogSourceError {
    return new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
}

function entryPayloadOffset(head: Buffer): number | null {
    if (head.length < LOCAL_HEADER_SIZE) {
        return null;
    }
    if (head.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE || head.readUInt16LE(8) !== METHOD_DEFLATED) {
        throw formatInvalid();
    }
    const offset: number = LOCAL_HEADER_SIZE + head.readUInt16LE(26) + head.readUInt16LE(28);
    return head.length < offset ? null : offset;
}

async function* payloadOf(body: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
    let head: Buffer = Buffer.alloc(0);
    let opened: boolean = false;
    for await (const chunk of chunksOf(body)) {
        if (opened) {
            yield chunk;
            continue;
        }
        head = Buffer.concat([head, chunk]);
        const offset: number | null = entryPayloadOffset(head);
        if (offset !== null) {
            opened = true;
            yield head.subarray(offset);
        }
    }
    if (!opened) {
        throw formatInvalid();
    }
}

function drained(stream: Inflate): Promise<void> {
    return new Promise<void>((resolve: () => void): void => {
        const done: () => void = (): void => {
            stream.off('drain', done);
            stream.off('close', done);
            resolve();
        };
        stream.once('drain', done);
        stream.once('close', done);
    });
}

async function feed(body: AsyncIterable<Uint8Array>, inflate: Inflate): Promise<void> {
    for await (const chunk of payloadOf(body)) {
        if (inflate.destroyed || inflate.writableEnded) {
            return;
        }
        if (!inflate.write(chunk)) {
            await drained(inflate);
        }
    }
    inflate.end();
}

export async function* firstZipEntryStream(body: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
    const inflate: Inflate = createInflateRaw();
    const feeding: Promise<void> = feed(body, inflate).catch((error: unknown): void => {
        inflate.destroy(error instanceof Error ? error : formatInvalid());
    });
    try {
        yield* inflate;
    } catch (error: unknown) {
        throw error instanceof CatalogSourceError ? error : formatInvalid();
    } finally {
        inflate.destroy();
        await feeding;
    }
}
