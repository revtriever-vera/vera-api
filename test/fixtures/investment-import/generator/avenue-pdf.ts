import { deflateSync } from 'node:zlib';
import { drawText, createRaster, Color } from './raster';
import { PdfLine, buildPdf } from './pdf-writer';
import { Raster } from './png-writer';

const SCALE: number = 2;
const PAPER: Color = [255, 255, 255];
const INK: Color = [20, 20, 24];
const PAGE_WIDTH: number = 842;
const PAGE_HEIGHT: number = 595;

export function buildTextPdf(lines: readonly PdfLine[]): Buffer {
    return buildPdf(lines);
}

export function rasterOfLines(lines: readonly PdfLine[]): Raster {
    const raster: Raster = createRaster(PAGE_WIDTH * SCALE, PAGE_HEIGHT * SCALE, PAPER);
    lines.forEach((line: PdfLine): void => {
        drawText(raster, line.text, line.x * SCALE, (PAGE_HEIGHT - line.y - line.size) * SCALE, line.bold ? 2 : 2, INK);
    });
    return raster;
}

function objectOf(index: number, body: Buffer): Buffer {
    return Buffer.concat([Buffer.from(`${String(index)} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
}

function streamOf(dictionary: string, content: Buffer): Buffer {
    return Buffer.concat([
        Buffer.from(`<< ${dictionary} /Length ${String(content.length)} >>\nstream\n`, 'latin1'),
        content,
        Buffer.from('\nendstream', 'latin1')
    ]);
}

export function buildImagePdf(raster: Raster): Buffer {
    const image: Buffer = streamOf(
        `/Type /XObject /Subtype /Image /Width ${String(raster.width)} /Height ${String(raster.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`,
        deflateSync(Buffer.from(raster.data), { level: 9 })
    );
    const drawing: Buffer = streamOf('', Buffer.from(`q ${String(PAGE_WIDTH)} 0 0 ${String(PAGE_HEIGHT)} 0 0 cm /Im0 Do Q`, 'latin1'));
    const bodies: Buffer[] = [
        Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
        Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
        Buffer.from(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
            'latin1'
        ),
        drawing,
        image
    ];
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
    const offsets: number[] = [];
    let length: number = parts[0]?.length ?? 0;
    bodies.forEach((body: Buffer, index: number): void => {
        const chunk: Buffer = objectOf(index + 1, body);
        offsets.push(length);
        length += chunk.length;
        parts.push(chunk);
    });
    const entries: string = offsets.map((offset: number): string => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    parts.push(
        Buffer.from(
            `xref\n0 ${String(offsets.length + 1)}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${String(offsets.length + 1)} /Root 1 0 R >>\nstartxref\n${String(length)}\n%%EOF\n`,
            'latin1'
        )
    );
    return Buffer.concat(parts);
}
