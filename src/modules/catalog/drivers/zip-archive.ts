import { inflateRawSync } from 'node:zlib';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';

const END_OF_DIRECTORY_SIGNATURE: number = 0x06054b50;
const CENTRAL_ENTRY_SIGNATURE: number = 0x02014b50;
const LOCAL_HEADER_SIGNATURE: number = 0x04034b50;
const END_OF_DIRECTORY_SIZE: number = 22;
const MAX_COMMENT_SIZE: number = 0xffff;
const CENTRAL_ENTRY_SIZE: number = 46;
const LOCAL_HEADER_SIZE: number = 30;
const METHOD_STORED: number = 0;
const METHOD_DEFLATED: number = 8;

interface ZipEntry {
    readonly name: string;
    readonly method: number;
    readonly compressedSize: number;
    readonly localOffset: number;
}

function formatInvalid(): CatalogSourceError {
    return new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
}

function endOfDirectoryOffset(archive: Buffer): number {
    const lowest: number = Math.max(0, archive.length - END_OF_DIRECTORY_SIZE - MAX_COMMENT_SIZE);
    for (let offset: number = archive.length - END_OF_DIRECTORY_SIZE; offset >= lowest; offset -= 1) {
        if (archive.readUInt32LE(offset) === END_OF_DIRECTORY_SIGNATURE) {
            return offset;
        }
    }
    throw formatInvalid();
}

function entriesOf(archive: Buffer): ZipEntry[] {
    const end: number = endOfDirectoryOffset(archive);
    const count: number = archive.readUInt16LE(end + 10);
    let cursor: number = archive.readUInt32LE(end + 16);
    const entries: ZipEntry[] = [];
    for (let index: number = 0; index < count; index += 1) {
        if (archive.readUInt32LE(cursor) !== CENTRAL_ENTRY_SIGNATURE) {
            throw formatInvalid();
        }
        const nameLength: number = archive.readUInt16LE(cursor + 28);
        const extraLength: number = archive.readUInt16LE(cursor + 30);
        const commentLength: number = archive.readUInt16LE(cursor + 32);
        entries.push({
            name: archive.toString('utf8', cursor + CENTRAL_ENTRY_SIZE, cursor + CENTRAL_ENTRY_SIZE + nameLength),
            method: archive.readUInt16LE(cursor + 10),
            compressedSize: archive.readUInt32LE(cursor + 20),
            localOffset: archive.readUInt32LE(cursor + 42)
        });
        cursor += CENTRAL_ENTRY_SIZE + nameLength + extraLength + commentLength;
    }
    return entries;
}

function contentOf(archive: Buffer, entry: ZipEntry): Buffer {
    if (archive.readUInt32LE(entry.localOffset) !== LOCAL_HEADER_SIGNATURE) {
        throw formatInvalid();
    }
    const nameLength: number = archive.readUInt16LE(entry.localOffset + 26);
    const extraLength: number = archive.readUInt16LE(entry.localOffset + 28);
    const start: number = entry.localOffset + LOCAL_HEADER_SIZE + nameLength + extraLength;
    const packed: Buffer = archive.subarray(start, start + entry.compressedSize);
    if (entry.method === METHOD_STORED) {
        return packed;
    }
    if (entry.method !== METHOD_DEFLATED) {
        throw formatInvalid();
    }
    return inflateRawSync(packed);
}

export function zipEntryContent(archive: Buffer, name: string): Buffer {
    try {
        const entry: ZipEntry | undefined = entriesOf(archive).find((candidate: ZipEntry): boolean => candidate.name === name);
        if (entry === undefined) {
            throw formatInvalid();
        }
        return contentOf(archive, entry);
    } catch (error: unknown) {
        throw error instanceof CatalogSourceError ? error : formatInvalid();
    }
}
