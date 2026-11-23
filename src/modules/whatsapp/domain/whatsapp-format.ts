export const MAX_TEXT_LENGTH: number = 4000;
export const BUTTON_TITLE_LIMIT: number = 20;
export const LIST_TITLE_LIMIT: number = 24;
export const MAX_BUTTONS: number = 3;
export const MAX_LIST_ROWS: number = 10;

const BULLET: RegExp = /^( *)[-*] /;
const HEADING: RegExp = /^#{1,6} (.*)$/;
const BOLD: RegExp = /\*\*([^*]+)\*\*|__([^_]+)__/g;
const LINK: RegExp = /\[([^\]]{1,200})\]\(([^)]{1,2000})\)/g;

function formatLine(line: string): string {
    const heading: RegExpExecArray | null = HEADING.exec(line);
    if (heading !== null) {
        return `*${heading[1] ?? ''}*`;
    }
    return line
        .replace(BULLET, '$1• ')
        .replace(BOLD, (_match: string, first: string | undefined, second: string | undefined): string => `*${first ?? second ?? ''}*`)
        .replace(LINK, '$1 ($2)');
}

export function toWhatsAppMarkup(markdown: string): string {
    return markdown.split('\n').map(formatLine).join('\n');
}

function cutPoint(text: string, limit: number): number {
    if (text.length <= limit) {
        return text.length;
    }
    const space: number = text.lastIndexOf(' ', limit);
    return space > 0 ? space : limit;
}

function splitLong(paragraph: string, limit: number): string[] {
    const pieces: string[] = [];
    let rest: string = paragraph;
    while (rest.length > limit) {
        const point: number = cutPoint(rest, limit);
        pieces.push(rest.slice(0, point).trimEnd());
        rest = rest.slice(point).trimStart();
    }
    return rest.length > 0 ? [...pieces, rest] : pieces;
}

export function splitIntoBlocks(text: string, limit: number = MAX_TEXT_LENGTH): string[] {
    const blocks: string[] = [];
    let current: string = '';
    for (const paragraph of text.split(/\n{2,}/).flatMap((part: string): string[] => splitLong(part, limit))) {
        const joined: string = current === '' ? paragraph : `${current}\n\n${paragraph}`;
        if (joined.length <= limit) {
            current = joined;
            continue;
        }
        blocks.push(current);
        current = paragraph;
    }
    return current === '' ? blocks : [...blocks, current];
}

export function clip(title: string, limit: number): string {
    const chars: string[] = Array.from(title);
    return chars.length <= limit ? title : chars.slice(0, limit).join('').trimEnd();
}
