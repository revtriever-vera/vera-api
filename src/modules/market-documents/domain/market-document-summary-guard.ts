import { MAX_SUMMARY_SENTENCES } from './market-document-summary.types';
import { MarketDocumentSummaryOutput } from './market-document-summary.schemas';

const NUMBER: RegExp = /\d[\d.,]*\d|\d/g;
const SENTENCE_BREAK: RegExp = /(?<=[.!?])\s+(?=\p{Lu})/u;
const MAX_FREE_COUNT: number = 12;
const DIGITS: RegExp = /\D/g;

const ADVICE: readonly RegExp[] = [
    /(?<![\p{L}\p{N}_])(?:compre|comprem|vendam|troque|troquem|mantenha|mantenham|aproveite|recomend\p{L}*)(?![\p{L}\p{N}_])/iu,
    /vale a pena|n[aã]o deixe de|oportunidade de (?:compra|venda)|venda (?:suas|seus|j[aá]|agora)/iu,
    /(?<![\p{L}\p{N}_])v(?:ai|[aã]o) (?:subir|cair|valorizar|disparar|render)(?![\p{L}\p{N}_])/iu,
    /(?:you should|buy now|sell now|worth (?:buying|selling|holding)|i recommend|we recommend|will (?:rise|soar|surge|yield))/iu,
    /(?:buy|sell) (?:it|this|these|shares|the stock)/iu
];
const OTHER_FORBIDDEN: readonly RegExp[] = [/!/u, /\p{Extended_Pictographic}/u, /(?<![\p{L}\p{N}_])(?:IA|AI)(?![\p{L}\p{N}_])/u];
const NOTICE_TEXT: RegExp = /n[aã]o [eé] (?:uma )?recomenda[çc][ãa]o|not (?:an? )?(?:investment )?(?:advice|recommendation)/iu;

export type SummaryGuardCheck = 'sentences' | 'number' | 'advice' | 'notice';

export type SummaryGuardResult = { readonly ok: true } | { readonly ok: false; readonly check: SummaryGuardCheck; readonly detail: string };

function failure(check: SummaryGuardCheck, detail: string): SummaryGuardResult {
    return { ok: false, check, detail };
}

export function signatureOf(token: string): string {
    return token.replace(DIGITS, '').replace(/^0+(?=\d)/, '');
}

export function numbersIn(text: string): string[] {
    return [...text.matchAll(NUMBER)].map((match: RegExpMatchArray): string => match[0]);
}

export function sentencesIn(text: string): number {
    return text
        .trim()
        .split(SENTENCE_BREAK)
        .filter((sentence: string): boolean => sentence !== '').length;
}

function isFreeCount(token: string): boolean {
    return /^\d{1,2}$/.test(token) && Number(token) <= MAX_FREE_COUNT;
}

function unknownNumber(candidates: readonly string[], source: string): string | undefined {
    const known: Set<string> = new Set<string>(numbersIn(source).map(signatureOf));
    return candidates.find((token: string): boolean => !isFreeCount(token) && !known.has(signatureOf(token)));
}

export function adviceIn(text: string): boolean {
    return (
        ADVICE.some((pattern: RegExp): boolean => pattern.test(text)) ||
        OTHER_FORBIDDEN.some((pattern: RegExp): boolean => pattern.test(text))
    );
}

export function guardDocumentSummary(output: MarketDocumentSummaryOutput, sourceText: string): SummaryGuardResult {
    if (sentencesIn(output.summary) > MAX_SUMMARY_SENTENCES) {
        return failure('sentences', `the summary must have at most ${String(MAX_SUMMARY_SENTENCES)} sentences`);
    }
    if (NOTICE_TEXT.test(output.summary)) {
        return failure('notice', 'do not write any investment notice: the system adds it');
    }
    if (adviceIn(output.summary)) {
        return failure('advice', 'the summary has advice, a forecast, an exclamation, an emoji or a mention of AI');
    }
    const unknown: string | undefined = unknownNumber([...numbersIn(output.summary), ...output.numbers.flatMap(numbersIn)], sourceText);
    if (unknown !== undefined) {
        return failure('number', `the figure ${unknown} is not in the document; cite only figures copied from it`);
    }
    return { ok: true };
}
