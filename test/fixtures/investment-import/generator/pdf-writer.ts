import { deflateSync } from 'node:zlib';

export interface PdfLine {
    readonly x: number;
    readonly y: number;
    readonly size: number;
    readonly bold: boolean;
    readonly text: string;
}

const PAGE_BOX: string = '[0 0 842 595]';

function escapePdfText(text: string): string {
    return text.replace(/[\\()]/g, (char: string): string => `\\${char}`);
}

function contentStream(lines: readonly PdfLine[]): Buffer {
    const commands: string[] = lines.map(
        (line: PdfLine): string =>
            `BT /${line.bold ? 'F2' : 'F1'} ${String(line.size)} Tf ${String(line.x)} ${String(line.y)} Td (${escapePdfText(line.text)}) Tj ET`
    );
    return Buffer.from(commands.join('\n'), 'latin1');
}

function streamObject(content: Buffer): Buffer {
    return Buffer.concat([
        Buffer.from(`<< /Length ${String(content.length)} >>\nstream\n`, 'latin1'),
        content,
        Buffer.from('\nendstream', 'latin1')
    ]);
}

function fontObject(name: string): Buffer {
    return Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`, 'latin1');
}

function pdfObjects(lines: readonly PdfLine[]): Buffer[] {
    return [
        Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
        Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
        Buffer.from(
            `<< /Type /Page /Parent 2 0 R /MediaBox ${PAGE_BOX} /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
            'latin1'
        ),
        streamObject(contentStream(lines)),
        fontObject('Helvetica'),
        fontObject('Helvetica-Bold')
    ];
}

function assemble(bodies: readonly Buffer[]): Buffer {
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
    const offsets: number[] = [];
    let length: number = parts[0]?.length ?? 0;
    bodies.forEach((body: Buffer, index: number): void => {
        const chunk: Buffer = Buffer.concat([
            Buffer.from(`${String(index + 1)} 0 obj\n`, 'latin1'),
            body,
            Buffer.from('\nendobj\n', 'latin1')
        ]);
        offsets.push(length);
        length += chunk.length;
        parts.push(chunk);
    });
    const entries: string = offsets.map((offset: number): string => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    const trailer: string = `xref\n0 ${String(offsets.length + 1)}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${String(offsets.length + 1)} /Root 1 0 R >>\nstartxref\n${String(length)}\n%%EOF\n`;
    parts.push(Buffer.from(trailer, 'latin1'));
    return Buffer.concat(parts);
}

export function buildPdf(lines: readonly PdfLine[]): Buffer {
    return assemble(pdfObjects(lines));
}

export function buildMultiPagePdf(pages: readonly (readonly PdfLine[])[]): Buffer {
    const firstPage: number = 5;
    const pageRefs: string = pages
        .map((_page: readonly PdfLine[], index: number): string => `${String(firstPage + index * 2)} 0 R`)
        .join(' ');
    const bodies: Buffer[] = [
        Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
        Buffer.from(`<< /Type /Pages /Kids [${pageRefs}] /Count ${String(pages.length)} >>`, 'latin1'),
        fontObject('Helvetica'),
        fontObject('Helvetica-Bold')
    ];
    pages.forEach((lines: readonly PdfLine[], index: number): void => {
        bodies.push(
            Buffer.from(
                `<< /Type /Page /Parent 2 0 R /MediaBox ${PAGE_BOX} /Contents ${String(firstPage + index * 2 + 1)} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
                'latin1'
            ),
            streamObject(contentStream(lines))
        );
    });
    return assemble(bodies);
}

export interface ImagePage {
    readonly width: number;
    readonly height: number;
    readonly rgb: Uint8Array;
}

export function buildImagePdf(image: ImagePage): Buffer {
    const pixels: Buffer = deflateSync(Buffer.from(image.rgb), { level: 9 });
    const content: Buffer = Buffer.from('q 842 0 0 595 0 0 cm /Im0 Do Q', 'latin1');
    const imageDictionary: Buffer = Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${String(image.width)} /Height ${String(image.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${String(pixels.length)} >>\nstream\n`,
        'latin1'
    );
    return assemble([
        Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
        Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
        Buffer.from(
            `<< /Type /Page /Parent 2 0 R /MediaBox ${PAGE_BOX} /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
            'latin1'
        ),
        streamObject(content),
        Buffer.concat([imageDictionary, pixels, Buffer.from('\nendstream', 'latin1')])
    ]);
}
