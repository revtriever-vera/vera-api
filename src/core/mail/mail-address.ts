const WHITESPACE: RegExp = /\s+/g;
const NEEDS_QUOTES: RegExp = /["\\<>,;:@[\]]/;

export function formatAddress(displayName: string, email: string): string {
    const name: string = displayName.replace(WHITESPACE, ' ').trim();
    if (name.length === 0) {
        return email;
    }
    return `${quote(name)} <${email}>`;
}

function quote(name: string): string {
    if (!NEEDS_QUOTES.test(name)) {
        return name;
    }
    return `"${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
