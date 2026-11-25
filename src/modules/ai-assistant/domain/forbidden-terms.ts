import { INVESTMENT_NOTICE_PHRASES } from './ask-fixed-replies';

const WORD_START: string = String.raw`(?<![\p{L}\p{N}_])`;
const WORD_END: string = String.raw`(?![\p{L}\p{N}_])`;

function wordsOf(alternatives: string): RegExp {
    return new RegExp(`${WORD_START}(?:${alternatives})${WORD_END}`, 'iu');
}

export const FIXED_ALLOWED_PHRASES: readonly RegExp[] = [
    /n[aã]o precisa vender/giu,
    /you (?:do not|don['’]t) need to sell/giu,
    ...INVESTMENT_NOTICE_PHRASES
];

export const ADVICE_PATTERNS: readonly RegExp[] = [
    wordsOf(
        'compre|comprem|venda|vendam|vender|troque|troquem|mantenha|mantenham|recomendo|recomendamos|vale a pena (?:comprar|vender|manter)'
    ),
    wordsOf('buy|sell|swap|keep holding|hold on to|worth (?:buying|selling|holding)|invest in|i recommend|we recommend'),
    wordsOf('rentabilidade futura|vai render|v[aã]o render'),
    wordsOf('future returns?|will yield|will earn')
];

const OTHER_FORBIDDEN_PATTERNS: readonly RegExp[] = [/(?<![\p{L}\p{N}_])(?:IA|AI)(?![\p{L}\p{N}_])/u, /!/u, /\p{Extended_Pictographic}/u];

const NAMED_INSTRUMENT: RegExp = new RegExp(
    `${WORD_START}(?:tesouro (?:selic|ipca|prefixado|direto)|cdb|lci|lca|bitcoin|ethereum|btc|eth)${WORD_END}`,
    'giu'
);
const B3_TICKER: RegExp = new RegExp(String.raw`${WORD_START}[A-Z]{4}\d{1,2}${WORD_END}`, 'gu');

export type AssetKeys = ReadonlySet<string>;

function instrumentKeyOf(match: string): string {
    const lower: string = match.toLowerCase();
    return lower.startsWith('tesouro') ? 'tesouro' : lower;
}

export function assetKeysIn(text: string): readonly string[] {
    const instruments: string[] = [...text.matchAll(NAMED_INSTRUMENT)].map((match: RegExpMatchArray): string => instrumentKeyOf(match[0]));
    const tickers: string[] = [...text.matchAll(B3_TICKER)].map((match: RegExpMatchArray): string => match[0].toLowerCase());
    return [...instruments, ...tickers];
}

function stripped(text: string): string {
    return FIXED_ALLOWED_PHRASES.reduce((rest: string, phrase: RegExp): string => rest.replace(phrase, ''), text);
}

export function adviceIn(text: string): boolean {
    const allowed: string = stripped(text);
    return ADVICE_PATTERNS.some((pattern: RegExp): boolean => pattern.test(allowed));
}

export function unknownAssetIn(text: string, known: AssetKeys): boolean {
    return assetKeysIn(stripped(text)).some((key: string): boolean => !known.has(key));
}

export function forbiddenTermIn(text: string, known: AssetKeys = new Set<string>()): boolean {
    const allowed: string = stripped(text);
    return (
        adviceIn(text) || unknownAssetIn(text, known) || OTHER_FORBIDDEN_PATTERNS.some((pattern: RegExp): boolean => pattern.test(allowed))
    );
}
