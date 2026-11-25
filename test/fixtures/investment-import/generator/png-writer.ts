import { deflateSync } from 'node:zlib';

export interface Raster {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8Array;
}

const PNG_SIGNATURE: Buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE: readonly number[] = Array.from({ length: 256 }, (_: unknown, n: number): number => {
    let value: number = n;
    for (let bit: number = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
});

function crc32(bytes: Buffer): number {
    let crc: number = 0xffffffff;
    for (const byte of bytes) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
    const typed: Buffer = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const length: Buffer = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const crc: Buffer = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
}

function header(raster: Raster): Buffer {
    const body: Buffer = Buffer.alloc(13);
    body.writeUInt32BE(raster.width, 0);
    body.writeUInt32BE(raster.height, 4);
    body[8] = 8;
    body[9] = 2;
    return chunk('IHDR', body);
}

function scanlines(raster: Raster): Buffer {
    const stride: number = raster.width * 3;
    const out: Buffer = Buffer.alloc((stride + 1) * raster.height);
    for (let row: number = 0; row < raster.height; row++) {
        out.set(raster.data.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
    }
    return out;
}

export function encodePng(raster: Raster): Buffer {
    return Buffer.concat([
        PNG_SIGNATURE,
        header(raster),
        chunk('IDAT', deflateSync(scanlines(raster), { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

export function readPngSize(png: Buffer): { readonly width: number; readonly height: number } {
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
