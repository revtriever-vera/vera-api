import heicConvert from 'heic-convert';
import sharp, { Sharp } from 'sharp';
import { FileUnreadableError } from '../investment-import.errors';
import { LlmImageMediaType } from '../../../../core/llm/llm.types';
import { MODEL_FILE_KINDS, ModelFileKind } from './model-file.types';
import { DeadlineExceededError, withTimeout } from './with-timeout';

export const MAX_IMAGE_SIDE_PX: number = 2000;
const MAX_INPUT_PIXELS: number = 100_000_000;
const IMAGE_TIMEOUT_MS: number = 15_000;
const JPEG_QUALITY: number = 90;
const HEIC_QUALITY: number = 0.92;

export interface PreparedImage {
    readonly mediaType: LlmImageMediaType;
    readonly data: Uint8Array;
}

async function decodedOf(bytes: Uint8Array, kind: ModelFileKind): Promise<Uint8Array> {
    if (kind !== MODEL_FILE_KINDS.heic) {
        return bytes;
    }
    return new Uint8Array(await heicConvert({ buffer: bytes, format: 'JPEG', quality: HEIC_QUALITY }));
}

async function resized(bytes: Uint8Array, kind: ModelFileKind): Promise<PreparedImage> {
    const pipeline: Sharp = sharp(await decodedOf(bytes, kind), { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width: MAX_IMAGE_SIDE_PX, height: MAX_IMAGE_SIDE_PX, fit: 'inside', withoutEnlargement: true });
    if (kind === MODEL_FILE_KINDS.png) {
        return { mediaType: 'image/png', data: new Uint8Array(await pipeline.png().toBuffer()) };
    }
    return { mediaType: 'image/jpeg', data: new Uint8Array(await pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer()) };
}

export async function prepareImage(bytes: Uint8Array, kind: ModelFileKind): Promise<PreparedImage> {
    try {
        return await withTimeout(resized(bytes, kind), IMAGE_TIMEOUT_MS);
    } catch (error: unknown) {
        throw new FileUnreadableError(error instanceof DeadlineExceededError ? 'timeout' : 'corrupt');
    }
}
