import archiver, { Archiver } from 'archiver';
import { once } from 'node:events';
import { Readable } from 'node:stream';

export interface ZipEntry {
    readonly name: string;
    readonly content: Buffer;
}

async function feed(archive: Archiver, entries: AsyncIterable<ZipEntry>, stop: AbortSignal): Promise<void> {
    for await (const entry of entries) {
        const written: Promise<unknown[]> = once(archive, 'entry', { signal: stop });
        archive.append(entry.content, { name: entry.name });
        await written;
    }
    await archive.finalize();
}

export function zipOf(entries: AsyncIterable<ZipEntry>): Readable {
    const archive: Archiver = archiver('zip', { zlib: { level: 6 } });
    const stop: AbortController = new AbortController();
    archive.on('close', (): void => {
        stop.abort();
    });
    feed(archive, entries, stop.signal).catch((error: unknown): void => {
        archive.destroy(error instanceof Error ? error : new Error('zip failed'));
    });
    return archive;
}
