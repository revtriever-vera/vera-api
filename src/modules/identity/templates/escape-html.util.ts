const HTML_ESCAPES: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

const HTML_SPECIALS: RegExp = /[&<>"']/g;

export function escapeHtml(value: string): string {
    return value.replace(HTML_SPECIALS, (character: string): string => HTML_ESCAPES[character] ?? character);
}
