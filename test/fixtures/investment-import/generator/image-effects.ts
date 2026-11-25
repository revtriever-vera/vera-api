import { Raster } from './png-writer';
import { Color, createRandom, createRaster, mapPixels } from './raster';

export function cropRaster(raster: Raster, width: number, height: number): Raster {
    const out: Raster = createRaster(width, height, [0, 0, 0]);
    for (let row: number = 0; row < height; row++) {
        out.data.set(raster.data.subarray(row * raster.width * 3, row * raster.width * 3 + width * 3), row * width * 3);
    }
    return out;
}

export function addNoise(raster: Raster, amplitude: number, seed: number): Raster {
    const random: () => number = createRandom(seed);
    return mapPixels(raster, (value: number): number => value + (random() - 0.5) * amplitude);
}

export function scaleBrightness(raster: Raster, factor: number): Raster {
    return mapPixels(raster, (value: number): number => value * factor);
}

export function vignette(raster: Raster, strength: number): Raster {
    const centerX: number = raster.width / 2;
    const centerY: number = raster.height / 2;
    const maxDistance: number = Math.hypot(centerX, centerY);
    return mapPixels(
        raster,
        (value: number, x: number, y: number): number => value * (1 - strength * (Math.hypot(x - centerX, y - centerY) / maxDistance) ** 2)
    );
}

function blurPass(raster: Raster, left: number, top: number, width: number, height: number, radius: number): Raster {
    const out: Uint8Array = new Uint8Array(raster.data);
    for (let y: number = top; y < Math.min(raster.height, top + height); y++) {
        for (let x: number = left; x < Math.min(raster.width, left + width); x++) {
            for (let channel: number = 0; channel < 3; channel++) {
                out[(y * raster.width + x) * 3 + channel] = averageAround(raster, x, y, channel, radius);
            }
        }
    }
    return { width: raster.width, height: raster.height, data: out };
}

function averageAround(raster: Raster, x: number, y: number, channel: number, radius: number): number {
    let sum: number = 0;
    let count: number = 0;
    for (let dy: number = -radius; dy <= radius; dy++) {
        for (let dx: number = -radius; dx <= radius; dx++) {
            const px: number = Math.min(raster.width - 1, Math.max(0, x + dx));
            const py: number = Math.min(raster.height - 1, Math.max(0, y + dy));
            sum += raster.data[(py * raster.width + px) * 3 + channel] ?? 0;
            count += 1;
        }
    }
    return Math.round(sum / count);
}

export function blurRegion(
    raster: Raster,
    left: number,
    top: number,
    width: number,
    height: number,
    radius: number,
    passes: number
): Raster {
    let current: Raster = raster;
    for (let pass: number = 0; pass < passes; pass++) {
        current = blurPass(current, left, top, width, height, radius);
    }
    return current;
}

function sampleInverse(raster: Raster, sourceX: number, sourceY: number, background: Color): Color {
    const x: number = Math.round(sourceX);
    const y: number = Math.round(sourceY);
    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) {
        return background;
    }
    const offset: number = (y * raster.width + x) * 3;
    return [raster.data[offset] ?? 0, raster.data[offset + 1] ?? 0, raster.data[offset + 2] ?? 0];
}

export function rotateOnBackground(raster: Raster, degrees: number, background: Color): Raster {
    const radians: number = (degrees * Math.PI) / 180;
    const cos: number = Math.cos(radians);
    const sin: number = Math.sin(radians);
    const out: Raster = createRaster(raster.width, raster.height, background);
    const centerX: number = raster.width / 2;
    const centerY: number = raster.height / 2;
    for (let y: number = 0; y < raster.height; y++) {
        for (let x: number = 0; x < raster.width; x++) {
            const dx: number = x - centerX;
            const dy: number = y - centerY;
            out.data.set(
                sampleInverse(raster, centerX + dx * cos + dy * sin, centerY - dx * sin + dy * cos, background),
                (y * raster.width + x) * 3
            );
        }
    }
    return out;
}
