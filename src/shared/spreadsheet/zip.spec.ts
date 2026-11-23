import JSZip from 'jszip';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ZipEntry, zipOf } from './zip';

async function bytesOf(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}

async function* entriesOf(...names: string[]): AsyncGenerator<ZipEntry> {
    await Promise.resolve();
    for (const name of names) {
        yield { name, content: Buffer.from(`conteudo de ${name}`) };
    }
}

describe('zipOf', () => {
    it('writes every entry, in order, into a readable zip', async () => {
        const zip: JSZip = await JSZip.loadAsync(await bytesOf(zipOf(entriesOf('a.xlsx', 'b.json'))));

        expect(Object.keys(zip.files)).toEqual(['a.xlsx', 'b.json']);
        expect(await (zip.file('b.json') as JSZip.JSZipObject).async('string')).toBe('conteudo de b.json');
    });

    it('builds the next entry only after the previous one was written', async () => {
        const events: string[] = [];
        async function* ordered(): AsyncGenerator<ZipEntry> {
            await Promise.resolve();
            events.push('build-1');
            yield { name: '1', content: Buffer.from('1') };
            events.push('build-2');
            yield { name: '2', content: Buffer.from('2') };
        }

        await bytesOf(zipOf(ordered()));

        expect(events).toEqual(['build-1', 'build-2']);
    });

    it('fails the stream when an entry cannot be built', async () => {
        async function* broken(): AsyncGenerator<ZipEntry> {
            yield { name: 'ok', content: Buffer.from('ok') };
            await Promise.reject(new Error('boom'));
        }

        await expect(bytesOf(zipOf(broken()))).rejects.toThrow('boom');
    });
});
