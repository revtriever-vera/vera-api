const DIACRITICS: RegExp = /\p{Diacritic}/gu;
const PUNCTUATION: ReadonlySet<string> = new Set(['.', '!', '?', ',', ';', ':']);

export function plainOf(text: string): string {
    const plain: string = text.normalize('NFD').replaceAll(DIACRITICS, '').trim().toLowerCase();
    let end: number = plain.length;
    while (end > 0 && PUNCTUATION.has(plain.charAt(end - 1))) {
        end -= 1;
    }
    return plain.slice(0, end).trimEnd();
}
