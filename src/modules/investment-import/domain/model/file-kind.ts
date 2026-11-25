import { MODEL_FILE_KINDS, ModelFileKind } from './model-file.types';

const PDF_MAGIC: readonly number[] = [0x25, 0x50, 0x44, 0x46];
const PNG_MAGIC: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC: readonly number[] = [0xff, 0xd8, 0xff];
const RIFF_MAGIC: readonly number[] = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG: readonly number[] = [0x57, 0x45, 0x42, 0x50];
const FTYP_TAG: readonly number[] = [0x66, 0x74, 0x79, 0x70];
const HEIC_BRANDS: ReadonlySet<string> = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const BRAND_OFFSET: number = 8;
const BRAND_LENGTH: number = 4;
const TAG_OFFSET: number = 4;
const WEBP_OFFSET: number = 8;

function matchesAt(bytes: Uint8Array, magic: readonly number[], offset: number): boolean {
    return magic.every((value: number, index: number): boolean => bytes[offset + index] === value);
}

function isHeic(bytes: Uint8Array): boolean {
    if (!matchesAt(bytes, FTYP_TAG, TAG_OFFSET)) {
        return false;
    }
    const brand: string = Buffer.from(bytes.subarray(BRAND_OFFSET, BRAND_OFFSET + BRAND_LENGTH)).toString('latin1');
    return HEIC_BRANDS.has(brand);
}

export function modelFileKindOf(bytes: Uint8Array): ModelFileKind | null {
    if (matchesAt(bytes, PDF_MAGIC, 0)) {
        return MODEL_FILE_KINDS.pdf;
    }
    if (matchesAt(bytes, PNG_MAGIC, 0)) {
        return MODEL_FILE_KINDS.png;
    }
    if (matchesAt(bytes, JPEG_MAGIC, 0)) {
        return MODEL_FILE_KINDS.jpeg;
    }
    if (matchesAt(bytes, RIFF_MAGIC, 0) && matchesAt(bytes, WEBP_TAG, WEBP_OFFSET)) {
        return MODEL_FILE_KINDS.webp;
    }
    return isHeic(bytes) ? MODEL_FILE_KINDS.heic : null;
}
