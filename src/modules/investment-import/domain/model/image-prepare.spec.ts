import sharp, { Metadata } from 'sharp';
import { describe, expect, it } from 'vitest';
import { FileUnreadableError } from '../investment-import.errors';
import { MAX_IMAGE_SIDE_PX, prepareImage } from './image-prepare';

async function imageOf(width: number, height: number, format: 'png' | 'jpeg' | 'webp'): Promise<Uint8Array> {
    const raw: Buffer = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
        .toFormat(format)
        .toBuffer();
    return new Uint8Array(raw);
}

describe('prepareImage', () => {
    it('reduz o lado maior a 2000 px e mantém o PNG como PNG', async () => {
        const prepared = await prepareImage(await imageOf(3000, 1200, 'png'), 'png');
        const meta: Metadata = await sharp(prepared.data).metadata();

        expect(prepared.mediaType).toBe('image/png');
        expect(meta.width).toBe(MAX_IMAGE_SIDE_PX);
        expect(meta.height).toBe(800);
    });

    it('JPEG e WEBP saem como JPEG, sem ampliar imagem pequena', async () => {
        const jpeg = await prepareImage(await imageOf(800, 600, 'jpeg'), 'jpeg');
        const webp = await prepareImage(await imageOf(500, 900, 'webp'), 'webp');

        expect(jpeg.mediaType).toBe('image/jpeg');
        expect((await sharp(jpeg.data).metadata()).width).toBe(800);
        expect(webp.mediaType).toBe('image/jpeg');
        expect((await sharp(webp.data).metadata()).height).toBe(900);
    });

    it('imagem corrompida é arquivo ilegível', async () => {
        await expect(prepareImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), 'png')).rejects.toBeInstanceOf(FileUnreadableError);
    });

    it('HEIC corrompido é arquivo ilegível', async () => {
        await expect(
            prepareImage(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]), 'heic')
        ).rejects.toBeInstanceOf(FileUnreadableError);
    });
});
