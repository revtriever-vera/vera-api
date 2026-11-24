import { deflateRawSync } from 'node:zlib';

const LOCAL_HEADER_SIZE: number = 30;
const CENTRAL_ENTRY_SIZE: number = 46;
const DEFLATED: number = 8;
const STORED: number = 0;

export interface ZipFixtureEntry {
    readonly name: string;
    readonly content: Buffer;
    readonly deflate: boolean;
}

function localHeader(entry: ZipFixtureEntry, packed: Buffer): Buffer {
    const header: Buffer = Buffer.alloc(LOCAL_HEADER_SIZE);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(entry.deflate ? DEFLATED : STORED, 8);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(entry.content.length, 22);
    header.writeUInt16LE(Buffer.byteLength(entry.name), 26);
    return Buffer.concat([header, Buffer.from(entry.name)]);
}

function centralEntry(entry: ZipFixtureEntry, packed: Buffer, offset: number): Buffer {
    const header: Buffer = Buffer.alloc(CENTRAL_ENTRY_SIZE);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(entry.deflate ? DEFLATED : STORED, 10);
    header.writeUInt32LE(packed.length, 20);
    header.writeUInt32LE(entry.content.length, 24);
    header.writeUInt16LE(Buffer.byteLength(entry.name), 28);
    header.writeUInt32LE(offset, 42);
    return Buffer.concat([header, Buffer.from(entry.name)]);
}

export function makeZip(entries: readonly ZipFixtureEntry[]): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset: number = 0;
    for (const entry of entries) {
        const packed: Buffer = entry.deflate ? deflateRawSync(entry.content) : entry.content;
        const local: Buffer = Buffer.concat([localHeader(entry, packed), packed]);
        centrals.push(centralEntry(entry, packed, offset));
        locals.push(local);
        offset += local.length;
    }
    const directory: Buffer = Buffer.concat(centrals);
    const end: Buffer = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
}
