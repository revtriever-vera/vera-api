import { EVENT_KINDS } from './portfolio-events.types';

export interface IncomeNotice {
    readonly kind: typeof EVENT_KINDS.dividend | typeof EVENT_KINDS.jcp;
    readonly exDate: string;
    readonly paymentDate: string | null;
    readonly amountPerUnit: string;
}

interface DateToken {
    readonly start: number;
    readonly end: number;
    readonly iso: string;
}

interface Anchor {
    readonly end: number;
    readonly gap: number;
}

const MONTHS: readonly string[] = [
    'janeiro',
    'fevereiro',
    'marco',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
];

const NUMERIC_DATE: RegExp = /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/g;
const WRITTEN_DATE: RegExp = /(\d{1,2})\s?[º°]?\sde\s([a-zç]{4,9})\sde\s(\d{4})/gi;
const AMOUNT_TOKEN: RegExp = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+)/g;
const ENGLISH_TAIL: RegExp = /\bNOTICE\s+TO\s+(?:THE\s+)?SHAREHOLDERS\b/i;
const JCP_TERM: RegExp = /juros\s+sobre\s+(?:o\s+)?capital\s+pr[óo]prio|\bJCP\b/i;
const DIVIDEND_TERM: RegExp = /dividendo|provento/i;
const SHARE: string = 'a[çc](?:[ãa]o|[õo]es)|units?|cotas?';
const PER_SHARE_BEFORE: RegExp = new RegExp(
    String.raw`(?:por|para cada)\s(?:cada\s)?(?:uma das\s)?(?:${SHARE})(?:\s\S+){0,2}\s?(?:de|é|:|-)?\s?$`,
    'i'
);
const PER_SHARE_AFTER: RegExp = new RegExp(String.raw`^[^R]{0,70}?(?:por|para cada)\s(?:cada\s)?(?:uma das\s)?(?:${SHARE})\b`, 'i');
const NET_BEFORE: RegExp = /l[íi]quid[oa][^R]{0,30}$/i;
const RESTATEMENT: RegExp = /passa\s+a\s+vigorar|deve-se\s+ler/gi;
const SENTENCE_BREAK: RegExp = /[.;]\s[A-ZÀ-Ú]/;
const PAYMENT_KEYWORD: RegExp = /pagamento|pag[oa]s?\b/gi;
const PAYMENT_CONNECTOR: RegExp = /(?:no\s(?:pr[óo]ximo\s)?dia|em|a\spartir\sd[eo]|na\sdata\sde)\s$/i;
const PAYMENT_BEFORE_DATE: RegExp = /(?:a\spartir\sd[eo]|em|no\sdia)\s?$/i;
const PAYMENT_AFTER_DATE: RegExp = /^\s?,?\sser[áãa]o?\s(?:realizad|efetuad|pag|feit)/i;
const PAYMENT_WINDOW: number = 140;
const DATE_MAX_LENGTH: number = 30;
const NET_LOOKBEHIND: number = 70;
const CONNECTOR_LOOKBEHIND: number = 20;
const MIN_YEAR: number = 2000;
const MAX_YEAR: number = 2100;
const MONTH_COUNT: number = 12;
const PAD: number = 2;

const EX_DATE_RULES: readonly { readonly keyword: RegExp; readonly gap: number }[] = [
    { keyword: /data[\s-]*com\b/gi, gap: 20 },
    { keyword: /posi[çc][ãa]o\s+acion[áa]ria/gi, gap: 40 },
    { keyword: /detentores\s+de\s+a[çc][õo]es/gi, gap: 80 },
    { keyword: /data[\s-]*base\b/gi, gap: 30 },
    { keyword: /far[ãa]o\s+jus/gi, gap: 120 }
];

function plain(text: string): string {
    return text.normalize('NFC').replaceAll(/\s+/g, ' ').trim();
}

function monthOf(name: string): string {
    const index: number = MONTHS.indexOf(name.toLowerCase().normalize('NFD').replaceAll(/[̀-ͯ]/g, ''));
    return index < 0 ? '' : String(index + 1);
}

function isoOf(year: string, month: string, day: string): string | null {
    const numericYear: number = Number(year);
    const numericMonth: number = Number(month);
    const lastDay: number = new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate();
    const valid: boolean = numericYear >= MIN_YEAR && numericYear <= MAX_YEAR && numericMonth >= 1 && numericMonth <= MONTH_COUNT;
    if (!valid || Number(day) < 1 || Number(day) > lastDay) {
        return null;
    }
    return `${year}-${month.padStart(PAD, '0')}-${day.padStart(PAD, '0')}`;
}

function tokenOf(match: RegExpExecArray, iso: string | null): DateToken[] {
    return iso === null ? [] : [{ start: match.index, end: match.index + match[0].length, iso }];
}

function datesOf(text: string): DateToken[] {
    const numeric: DateToken[] = [...text.matchAll(NUMERIC_DATE)].flatMap((match: RegExpExecArray): DateToken[] =>
        tokenOf(match, isoOf(match[3] ?? '', match[2] ?? '', match[1] ?? ''))
    );
    const written: DateToken[] = [...text.matchAll(WRITTEN_DATE)].flatMap((match: RegExpExecArray): DateToken[] =>
        tokenOf(match, isoOf(match[3] ?? '', monthOf(match[2] ?? ''), match[1] ?? ''))
    );
    return [...numeric, ...written].sort((left: DateToken, right: DateToken): number => left.start - right.start);
}

function kindOf(text: string): IncomeNotice['kind'] | null {
    const jcp: number = text.search(JCP_TERM);
    const dividend: number = text.search(DIVIDEND_TERM);
    if (jcp < 0 && dividend < 0) {
        return null;
    }
    return dividend < 0 || (jcp >= 0 && jcp < dividend) ? EVENT_KINDS.jcp : EVENT_KINDS.dividend;
}

function dateAfter(text: string, anchor: Anchor, connector: RegExp | null): string | null {
    const window: string = text.slice(anchor.end, anchor.end + anchor.gap + DATE_MAX_LENGTH);
    const first: DateToken | undefined = datesOf(window).find(
        (date: DateToken): boolean => connector === null || connector.test(window.slice(0, date.start))
    );
    if (first === undefined || first.start > anchor.gap || SENTENCE_BREAK.test(window.slice(0, first.start))) {
        return null;
    }
    return first.iso;
}

function anchorsOf(text: string, keyword: RegExp, gap: number): Anchor[] {
    return [...text.matchAll(keyword)].map((match: RegExpExecArray): Anchor => ({ end: match.index + match[0].length, gap }));
}

function exDateOf(text: string): string | null {
    const dates: (string | null)[] = EX_DATE_RULES.flatMap((rule: { keyword: RegExp; gap: number }): (string | null)[] =>
        anchorsOf(text, rule.keyword, rule.gap).map((anchor: Anchor): string | null => dateAfter(text, anchor, null))
    );
    return dates.find((date: string | null): boolean => date !== null) ?? null;
}

function paymentAfterKeyword(text: string): (string | null)[] {
    return anchorsOf(text, PAYMENT_KEYWORD, PAYMENT_WINDOW).map((anchor: Anchor): string | null =>
        dateAfter(text, anchor, PAYMENT_CONNECTOR)
    );
}

function paymentBeforeVerb(text: string, dates: readonly DateToken[]): (string | null)[] {
    return dates.map((date: DateToken): string | null => {
        const before: string = text.slice(Math.max(0, date.start - CONNECTOR_LOOKBEHIND), date.start);
        return PAYMENT_BEFORE_DATE.test(before) && PAYMENT_AFTER_DATE.test(text.slice(date.end, date.end + DATE_MAX_LENGTH))
            ? date.iso
            : null;
    });
}

function paymentDateOf(text: string, exDate: string): string | null {
    const candidates: (string | null)[] = [...paymentAfterKeyword(text), ...paymentBeforeVerb(text, datesOf(text))];
    return candidates.find((date: string | null): boolean => date !== null && date > exDate) ?? null;
}

function decimalOf(brazilian: string): string {
    return brazilian.replaceAll('.', '').replace(',', '.');
}

function isPerShare(before: string, after: string): boolean {
    return PER_SHARE_BEFORE.test(before) || PER_SHARE_AFTER.test(after);
}

function grossPerShareAmounts(text: string): Set<string> {
    const matches: RegExpExecArray[] = [...text.matchAll(AMOUNT_TOKEN)];
    const gross: Set<string> = new Set<string>();
    matches.forEach((match: RegExpExecArray, index: number): void => {
        const before: string = text.slice(Math.max(0, match.index - NET_LOOKBEHIND), match.index);
        const after: string = text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length);
        if (isPerShare(before, after) && !NET_BEFORE.test(before)) {
            gross.add(decimalOf(match[1] ?? ''));
        }
    });
    return gross;
}

function currentWording(text: string): string {
    const restated: RegExpMatchArray | undefined = [...text.matchAll(RESTATEMENT)].at(-1);
    return restated === undefined ? text : text.slice(restated.index);
}

function portugueseBody(rawText: string): string {
    const english: number = rawText.search(ENGLISH_TAIL);
    return english > 0 ? rawText.slice(0, english) : rawText;
}

export function parseIncomeNotice(rawText: string): IncomeNotice | null {
    const text: string = currentWording(plain(portugueseBody(rawText)));
    const kind: IncomeNotice['kind'] | null = kindOf(text);
    const exDate: string | null = exDateOf(text);
    const amounts: string[] = [...grossPerShareAmounts(text)];
    const [amount]: string[] = amounts;
    if (kind === null || exDate === null || amounts.length !== 1 || amount === undefined) {
        return null;
    }
    return { kind, exDate, paymentDate: paymentDateOf(text, exDate), amountPerUnit: amount };
}
