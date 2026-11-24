import { TextDecoder } from 'node:util';
import { cell, columnIndexes } from './line-stream';

export type CsvRow = (column: string) => string;

const LATIN_ENCODING: string = 'windows-1252';
const LINE_BREAK: RegExp = /\r?\n/;

export function decodeCsv(content: Buffer): string {
    return new TextDecoder(LATIN_ENCODING).decode(content);
}

export function* csvRows(text: string, required: readonly string[]): Generator<CsvRow> {
    const lines: string[] = text.split(LINE_BREAK);
    const indexes: ReadonlyMap<string, number> = columnIndexes(lines[0] ?? '', required);
    for (let position: number = 1; position < lines.length; position += 1) {
        const line: string = lines[position] ?? '';
        if (line !== '') {
            const columns: string[] = line.split(';');
            yield (column: string): string => cell(columns, indexes, column);
        }
    }
}

export function digitsOf(cnpj: string): string {
    return cnpj.replace(/\D/g, '');
}

export function seriesKeyOf(cnpj: string, subclassId: string): string {
    return subclassId === '' ? cnpj : `${cnpj}:${subclassId}`;
}

const NAME_SUFFIXES: readonly string[] = ['RESPONSABILIDADE LIMITADA', 'RESP LIMITADA', 'RESP LTDA', 'RESP. LTDA'];
const SEPARATORS: ReadonlySet<string> = new Set<string>([' ', '-']);

function withoutTrailingSeparators(name: string): string {
    let end: number = name.length;
    while (end > 0 && SEPARATORS.has(name.charAt(end - 1))) {
        end -= 1;
    }
    return name.slice(0, end);
}

export function tidyName(name: string): string {
    const collapsed: string = name.replaceAll(/\s+/g, ' ').trim();
    const suffix: string | undefined = NAME_SUFFIXES.find((candidate: string): boolean =>
        collapsed.toUpperCase().endsWith(` ${candidate}`)
    );
    return withoutTrailingSeparators(suffix === undefined ? collapsed : collapsed.slice(0, collapsed.length - suffix.length));
}
