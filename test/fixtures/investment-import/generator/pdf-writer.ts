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

export function buildPdf(lines: readonly PdfLine[]): Buffer {
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
    const offsets: number[] = [];
    let length: number = parts[0]?.length ?? 0;
    pdfObjects(lines).forEach((body: Buffer, index: number): void => {
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
