const WHITESPACE: RegExp = /\s+/;

export function firstNameOf(name: string): string {
    return name.trim().split(WHITESPACE)[0] ?? '';
}
