const FILE_LINE: RegExp = /(?:^|\n)Arquivo: [^\n]*$/;
const FILE_PREFIX: string = 'Arquivo: ';

export function questionTextOf(text: string | undefined, fileName: string | null): string {
    const typed: string = text ?? '';
    if (fileName === null) {
        return typed;
    }
    return typed === '' ? `${FILE_PREFIX}${fileName}` : `${typed}\n${FILE_PREFIX}${fileName}`;
}

export function withoutFileLine(text: string): string {
    return text.replace(FILE_LINE, '').trim();
}
