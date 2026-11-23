const WORD_START: string = String.raw`(?<![\p{L}\p{N}_])`;
const WORD_END: string = String.raw`(?![\p{L}\p{N}_])`;

function wordsOf(alternatives: string): RegExp {
    return new RegExp(`${WORD_START}(?:${alternatives})${WORD_END}`, 'iu');
}

export const FIXED_ALLOWED_PHRASES: readonly RegExp[] = [/n[aã]o precisa vender/giu, /you (?:do not|don['’]t) need to sell/giu];

export const FORBIDDEN_PATTERNS: readonly RegExp[] = [
    wordsOf('compre|comprem|venda|vendam|vender|recomendo|recomendamos'),
    wordsOf('buy|sell|invest in|i recommend|we recommend'),
    wordsOf('rentabilidade futura|vai render|v[aã]o render'),
    wordsOf('future returns?|will yield|will earn'),
    wordsOf('tesouro (?:selic|ipca|prefixado|direto)|cdb|lci|lca|bitcoin|ethereum|btc|eth'),
    /(?<![\p{L}\p{N}_])[A-Z]{4}\d{1,2}(?![\p{L}\p{N}_])/u,
    /(?<![\p{L}\p{N}_])(?:IA|AI)(?![\p{L}\p{N}_])/u,
    /!/u,
    /\p{Extended_Pictographic}/u
];

export function forbiddenTermIn(text: string): boolean {
    const allowed: string = FIXED_ALLOWED_PHRASES.reduce((rest: string, phrase: RegExp): string => rest.replace(phrase, ''), text);
    return FORBIDDEN_PATTERNS.some((pattern: RegExp): boolean => pattern.test(allowed));
}
