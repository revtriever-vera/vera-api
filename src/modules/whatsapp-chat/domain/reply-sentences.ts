const LIST_ITEM: RegExp = /^\s*(?:[-*•]|\d{1,2}[.)])\s/;
const SENTENCE_END: RegExp = /(?<=[.!?])\s+(?=\S)/;

function sentencesOf(line: string): string[] {
    return line.split(SENTENCE_END).filter((sentence: string): boolean => sentence.length > 0);
}

function proseLineOf(line: string, budget: number): { readonly kept: string; readonly used: number } {
    const kept: string[] = sentencesOf(line).slice(0, Math.max(budget, 0));
    return { kept: kept.join(' '), used: kept.length };
}

export function limitSentences(text: string, max: number): string {
    const lines: string[] = [];
    let left: number = max;
    for (const line of text.split('\n')) {
        if (LIST_ITEM.test(line) || line.trim().length === 0) {
            lines.push(line);
            continue;
        }
        const prose: { readonly kept: string; readonly used: number } = proseLineOf(line, left);
        left -= prose.used;
        if (prose.kept.length > 0) {
            lines.push(prose.kept);
        }
    }
    return lines.join('\n').trim();
}
