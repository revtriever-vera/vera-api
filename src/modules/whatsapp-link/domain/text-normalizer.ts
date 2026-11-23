const TRAILING: ReadonlySet<string> = new Set(['.', '!', '?', ',', ';', ':', ' ', '\t', '\n', '\r']);

export function stripTrailingPunctuation(text: string): string {
    let end: number = text.length;
    while (end > 0 && TRAILING.has(text.charAt(end - 1))) {
        end -= 1;
    }
    return text.slice(0, end);
}
