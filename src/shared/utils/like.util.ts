const LIKE_SPECIALS: RegExp = /[\\%_]/g;

export function escapeLike(text: string): string {
    return text.replace(LIKE_SPECIALS, String.raw`\$&`);
}

export function likePattern(text: string): string {
    return `%${escapeLike(text)}%`;
}
