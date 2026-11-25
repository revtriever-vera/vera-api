import { GLYPH_HEIGHT, GLYPH_WIDTH, glyphFor, normalizeText } from './bitmap-font';
import { Raster } from './png-writer';

export type Color = readonly [number, number, number];

export function createRaster(width: number, height: number, color: Color): Raster {
    const data: Uint8Array = new Uint8Array(width * height * 3);
    for (let index: number = 0; index < width * height; index++) {
        data.set(color, index * 3);
    }
    return { width, height, data };
}

export function fillRect(raster: Raster, x: number, y: number, width: number, height: number, color: Color): void {
    for (let row: number = Math.max(0, y); row < Math.min(raster.height, y + height); row++) {
        for (let column: number = Math.max(0, x); column < Math.min(raster.width, x + width); column++) {
            raster.data.set(color, (row * raster.width + column) * 3);
        }
    }
}

function drawGlyph(raster: Raster, glyph: readonly string[], x: number, y: number, scale: number, color: Color): void {
    glyph.forEach((line: string, row: number): void => {
        line.split('').forEach((pixel: string, column: number): void => {
            if (pixel === '#') {
                fillRect(raster, x + column * scale, y + row * scale, scale, scale, color);
            }
        });
    });
}

export function textWidth(text: string, scale: number): number {
    return text.length * (GLYPH_WIDTH + 1) * scale;
}

export function drawText(raster: Raster, text: string, x: number, y: number, scale: number, color: Color): void {
    normalizeText(text)
        .split('')
        .forEach((char: string, index: number): void => {
            drawGlyph(raster, glyphFor(char), x + index * (GLYPH_WIDTH + 1) * scale, y, scale, color);
        });
}

export function textHeight(scale: number): number {
    return GLYPH_HEIGHT * scale;
}

export function mapPixels(raster: Raster, transform: (value: number, x: number, y: number) => number): Raster {
    const data: Uint8Array = new Uint8Array(raster.data.length);
    for (let index: number = 0; index < raster.data.length; index++) {
        const pixel: number = Math.floor(index / 3);
        data[index] = Math.max(
            0,
            Math.min(255, Math.round(transform(raster.data[index] ?? 0, pixel % raster.width, Math.floor(pixel / raster.width))))
        );
    }
    return { width: raster.width, height: raster.height, data };
}

export function createRandom(seed: number): () => number {
    let state: number = seed;
    return (): number => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed: number = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}
