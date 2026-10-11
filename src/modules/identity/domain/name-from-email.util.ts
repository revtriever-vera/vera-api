const SEPARATORS: RegExp = /[._-]+/g;

function capitalize(word: string): string {
    const first: string = word.slice(0, 1);
    return first.toUpperCase() + word.slice(1);
}

export function nameFromEmail(email: string): string {
    const localPart: string = email.split('@')[0] ?? email;
    const words: string[] = localPart
        .split(SEPARATORS)
        .map((word: string) => word.trim())
        .filter((word: string) => word.length > 0);
    return words.length === 0 ? localPart : words.map(capitalize).join(' ');
}
