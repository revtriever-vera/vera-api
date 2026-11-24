import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { makeZip } from './fixtures/make-zip';
import { firstZipEntryStream } from './zip-stream';

function chunked(buffer: Buffer, size: number): AsyncGenerator<Uint8Array> {
    const parts: Uint8Array[] = [];
    for (let offset: number = 0; offset < buffer.length; offset += size) {
        parts.push(buffer.subarray(offset, offset + size));
    }
    return (async function* (): AsyncGenerator<Uint8Array> {
        for (const part of parts) {
            yield await Promise.resolve(part);
        }
    })();
}

async function read(body: AsyncIterable<Uint8Array>): Promise<string> {
    const parts: Buffer[] = [];
    for await (const chunk of firstZipEntryStream(body)) {
        parts.push(Buffer.from(chunk));
    }
    return Buffer.concat(parts).toString('utf-8');
}

const CONTENT: string = Array.from({ length: 5000 }, (_unused: unknown, index: number) => `line ${String(index)}`).join('\n');
const ARCHIVE: Buffer = makeZip([{ name: 'data.csv', content: Buffer.from(CONTENT), deflate: true }]);

describe('firstZipEntryStream', () => {
    it.each([1, 7, 64, 100000])('inflates the first entry whatever the chunk size (%i bytes)', async (size: number) => {
        expect(await read(chunked(ARCHIVE, size))).toBe(CONTENT);
    });

    it('ignores what follows the deflate stream, like the central directory', async () => {
        const trailing: Buffer = Buffer.concat([ARCHIVE, Buffer.alloc(4096, 1)]);

        expect(await read(chunked(trailing, 512))).toBe(CONTENT);
    });

    it('rejects an entry that is not deflated', async () => {
        const stored: Buffer = makeZip([{ name: 'data.csv', content: Buffer.from('abc'), deflate: false }]);

        await expect(read(chunked(stored, 16))).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('rejects a body shorter than a zip header', async () => {
        await expect(read(chunked(Buffer.from('PK'), 16))).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('rejects corrupt deflate data', async () => {
        const corrupt: Buffer = Buffer.from(ARCHIVE);
        const garbage: Buffer = deflateRawSync(Buffer.from('xyz'));
        garbage.fill(0xff);
        garbage.copy(corrupt, 30 + 'data.csv'.length);

        await expect(read(chunked(corrupt, 64))).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('rejects a stream that ends before the deflate stream does', async () => {
        await expect(read(chunked(ARCHIVE.subarray(0, 200), 64))).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('stops cleanly when the consumer gives up early', async () => {
        const iterator: AsyncGenerator<Uint8Array> = firstZipEntryStream(chunked(ARCHIVE, 64));
        await iterator.next();

        await expect(iterator.return(undefined)).resolves.toMatchObject({ done: true });
    });
});
