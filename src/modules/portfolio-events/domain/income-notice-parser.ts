import {
    AMOUNT_TOKEN,
    columnAmounts,
    decimalOf,
    DeclaredAmount,
    headerTables,
    isPerShareMagnitude,
    NET_BEFORE
} from './income-notice-tables';
import { EVENT_KINDS, SHARE_CLASSES, ShareClass } from './portfolio-events.types';

export interface IncomeNotice {
    readonly kind: typeof EVENT_KINDS.dividend | typeof EVENT_KINDS.jcp;
    readonly exDate: string;
    readonly paymentDate: string | null;
    readonly amountPerUnit: string;
    readonly shareClass: ShareClass | null;
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
const ENGLISH_TAIL: RegExp = /\bNOTICE\s+TO\s+(?:THE\s+)?SHAREHOLDERS\b/i;
const JCP_TERM: RegExp = /juros\s+sobre\s+(?:o\s+)?capital\s+pr[óo]prio|\bJCP\b/i;
const DIVIDEND_TERM: RegExp = /dividendo|provento/i;
const SHARE: string = 'a[çc](?:[ãa]o|[õo]es)|units?|cotas?';
const PER_SHARE_BEFORE: RegExp = new RegExp(
    String.raw`(?:por|para cada)\s(?:cada\s)?(?:uma das\s)?(?:${SHARE})(?:\s\S+){0,2}\s?(?:de|é|:|-)?\s?$`,
    'i'
);
const PER_SHARE_AFTER: RegExp = new RegExp(String.raw`^[^R.;]{0,70}?(?:por|para cada)\s(?:cada\s)?(?:uma das\s)?(?:${SHARE})\b`, 'i');
const INCOME_ROW_LABEL: string = String.raw`(?:dividendos?|JCP|juros\s+sobre\s+(?:o\s+)?capital\s+pr[óo]prio)`;
const PER_SHARE_TABLE_BEFORE: RegExp = new RegExp(String.raw`por\s+a[çc][ãa]o\s+data\s+d[eo]\s+pagamento\s+${INCOME_ROW_LABEL}\s?$`, 'i');
const PAYMENT_TABLE_ROW: RegExp = new RegExp(
    String.raw`data\s+d[eo]\s+pagamento\s+${INCOME_ROW_LABEL}\s+R\$\s?\d[\d.,]*\s+(\d{1,2}[/.]\d{1,2}[/.]\d{4})`,
    'i'
);
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

const CLASS_SOURCE: string = String.raw`[Oo]rdin[áa]ri[ao]s?|[Pp]referenci(?:al|ais)(?:\s+classe\s+[AB]\b)?|\bON\b|\bPN[AB]?\b|\b(?:[Uu]nits?|UNITS?)\b`;
const CLASS_TERM: RegExp = new RegExp(CLASS_SOURCE, 'g');
const CLASS_LIST: string = String.raw`(?:${CLASS_SOURCE})(?:\s?(?:,|e|ou|/)\s?(?:${CLASS_SOURCE}))*`;
const CLASS_BEFORE: RegExp = new RegExp(String.raw`(${CLASS_LIST})[\s:\-–)]{0,4}(?:(?:de|é|igual a|no valor de)\s)?$`);
const CLASS_AFTER: RegExp = new RegExp(String.raw`^[^R]{0,70}?(?:por|para cada)\s(?:cada\s)?(?:uma das\s)?((?:${SHARE})\b.{0,40})`, 'i');
const CLASS_TABLE_ROW: RegExp = new RegExp(String.raw`(${CLASS_SOURCE})[\s:\-–]{1,3}(\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+)(?![\d%]|\s%)`, 'g');
const PER_SHARE_MAGNITUDE: RegExp = /^\d{1,3},\d+$/;
const UNIT_TERM: RegExp = /\bunits?\b/i;
const UNIT_COMPOSITION: RegExp = /(?:composta|formada|representad\S+)\s+por\s+(\w+)\s+a\S+\s+ordin\S+\s+e\s+(\w+)\s+a\S+\s+prefer/i;
const NUMBER_WORDS: Readonly<Record<string, number>> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 };
const AMOUNT_SCALE: number = 12;
const MIN_DECIMALS: number = 2;
const TEN: bigint = 10n;

interface AmountEntry {
    readonly classes: readonly ShareClass[];
    readonly amount: string;
}

const EX_DATE_RULES: readonly { readonly keyword: RegExp; readonly gap: number }[] = [
    { keyword: /data[\s-]*[“"”]?com\b(?:-?direitos?)?[“"”]?/gi, gap: 20 },
    { keyword: /posi[çc][ãa]o\s+acion[áa]ria/gi, gap: 40 },
    { keyword: /(?:detentores|titulares)\s+de\s+a[çc][õo]es/gi, gap: 80 },
    { keyword: /dados\s+cadastrais\s+existentes\s+n[oa]s?/gi, gap: 60 },
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

function paymentInTable(text: string): string | null {
    const row: string | undefined = PAYMENT_TABLE_ROW.exec(text)?.[1];
    return row === undefined ? null : (datesOf(row)[0]?.iso ?? null);
}

function paymentDateOf(text: string, exDate: string): string | null {
    const candidates: (string | null)[] = [paymentInTable(text), ...paymentAfterKeyword(text), ...paymentBeforeVerb(text, datesOf(text))];
    return candidates.find((date: string | null): boolean => date !== null && date > exDate) ?? null;
}

function isPerShare(before: string, after: string): boolean {
    return PER_SHARE_BEFORE.test(before) || PER_SHARE_TABLE_BEFORE.test(before) || PER_SHARE_AFTER.test(after);
}

function classOf(label: string): ShareClass {
    const lower: string = label.toLowerCase();
    if (lower.startsWith('ordin') || label === 'ON') {
        return SHARE_CLASSES.on;
    }
    if (lower.startsWith('unit')) {
        return SHARE_CLASSES.unit;
    }
    const series: string = /classe\s+([AB])$/.exec(label)?.[1] ?? /^PN([AB])$/.exec(label)?.[1] ?? '';
    if (series === 'A') {
        return SHARE_CLASSES.pna;
    }
    return series === 'B' ? SHARE_CLASSES.pnb : SHARE_CLASSES.pn;
}

function classesIn(segment: string): ShareClass[] {
    return [...new Set<ShareClass>([...segment.matchAll(CLASS_TERM)].map((match: RegExpExecArray): ShareClass => classOf(match[0])))];
}

function classesFor(before: string, after: string): ShareClass[] {
    const labelBefore: string | undefined = CLASS_BEFORE.exec(before)?.[1];
    if (labelBefore !== undefined) {
        return classesIn(labelBefore);
    }
    const labelAfter: string | undefined = CLASS_AFTER.exec(after)?.[1];
    return labelAfter === undefined ? [] : classesIn(labelAfter.split(/[.;,]/)[0] ?? '');
}

function isPerShareToken(match: RegExpExecArray, before: string, after: string, labeled: boolean): boolean {
    const amount: string = match[1] ?? '';
    return (labeled || isPerShare(before, after)) && !NET_BEFORE.test(before) && isPerShareMagnitude(amount);
}

function tokenEntry(text: string, matches: readonly RegExpExecArray[], index: number): AmountEntry | null {
    const match: RegExpExecArray | undefined = matches[index];
    if (match === undefined) {
        return null;
    }
    const before: string = text.slice(Math.max(0, match.index - NET_LOOKBEHIND), match.index);
    const after: string = text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length);
    const classes: ShareClass[] = classesFor(before, after);
    const labeled: boolean = classes.length > 0 && PER_SHARE_MAGNITUDE.test(match[1] ?? '');
    return isPerShareToken(match, before, after, labeled) ? { classes: labeled ? classes : [], amount: decimalOf(match[1] ?? '') } : null;
}

function amountEntries(text: string): AmountEntry[] {
    const matches: RegExpExecArray[] = [...text.matchAll(AMOUNT_TOKEN)];
    const entries: AmountEntry[] = matches
        .map((_match: RegExpExecArray, index: number): AmountEntry | null => tokenEntry(text, matches, index))
        .filter((entry: AmountEntry | null): entry is AmountEntry => entry !== null);
    const rows: AmountEntry[] = [...text.matchAll(CLASS_TABLE_ROW)]
        .filter((match: RegExpExecArray): boolean => isPerShareMagnitude(match[2] ?? ''))
        .map((match: RegExpExecArray): AmountEntry => ({
            classes: [classOf(match[1] ?? '')],
            amount: decimalOf(match[2] ?? '')
        }));
    return [...entries, ...rows];
}

function amountsByClass(entries: readonly AmountEntry[]): Map<ShareClass | null, Set<string>> {
    const grouped: Map<ShareClass | null, Set<string>> = new Map<ShareClass | null, Set<string>>();
    const pairs: [ShareClass | null, string][] = entries.flatMap((entry: AmountEntry): [ShareClass | null, string][] =>
        (entry.classes.length === 0 ? [null] : entry.classes).map((shareClass: ShareClass | null): [ShareClass | null, string] => [
            shareClass,
            entry.amount
        ])
    );
    for (const [shareClass, amount] of pairs) {
        grouped.set(shareClass, (grouped.get(shareClass) ?? new Set<string>()).add(amount));
    }
    return grouped;
}

function numberOf(word: string): number {
    return Number(word) || (NUMBER_WORDS[word.toLowerCase().normalize('NFD').replaceAll(/[̀-ͯ]/g, '')] ?? 0);
}

function scaled(amount: string): bigint {
    const [whole, fraction]: string[] = amount.split('.');
    return BigInt(`${whole ?? '0'}${(fraction ?? '').padEnd(AMOUNT_SCALE, '0')}`);
}

function unscaled(value: bigint): string {
    const unit: bigint = TEN ** BigInt(AMOUNT_SCALE);
    const digits: string = (value % unit).toString().padStart(AMOUNT_SCALE, '0');
    let end: number = digits.length;
    while (end > MIN_DECIMALS && digits[end - 1] === '0') {
        end -= 1;
    }
    return `${(value / unit).toString()}.${digits.slice(0, end)}`;
}

function unitAmount(text: string, amounts: ReadonlyMap<ShareClass, string>): string | null {
    const composition: RegExpExecArray | null = UNIT_TERM.test(text) ? UNIT_COMPOSITION.exec(text) : null;
    const common: string | undefined = amounts.get(SHARE_CLASSES.on);
    const preferred: string | undefined = amounts.get(SHARE_CLASSES.pn);
    const commonCount: number = numberOf(composition?.[1] ?? '');
    const preferredCount: number = numberOf(composition?.[2] ?? '');
    if (common === undefined || preferred === undefined || commonCount === 0 || preferredCount === 0) {
        return null;
    }
    return unscaled(scaled(common) * BigInt(commonCount) + scaled(preferred) * BigInt(preferredCount));
}

function grossAmountsByClass(text: string): Map<ShareClass | null, string> | null {
    const grouped: Map<ShareClass | null, Set<string>> = amountsByClass(amountEntries(text));
    const labeled: [ShareClass | null, Set<string>][] = [...grouped].filter(
        ([shareClass]: [ShareClass | null, Set<string>]): boolean => shareClass !== null
    );
    const chosen: [ShareClass | null, Set<string>][] = labeled.length > 0 ? labeled : [...grouped];
    if (chosen.length === 0 || chosen.some(([, amounts]: [ShareClass | null, Set<string>]): boolean => amounts.size !== 1)) {
        return null;
    }
    return new Map<ShareClass | null, string>(
        chosen.map(([shareClass, amounts]: [ShareClass | null, Set<string>]): [ShareClass | null, string] => [
            shareClass,
            [...amounts][0] ?? ''
        ])
    );
}

function withUnit(text: string, amounts: Map<ShareClass | null, string>): Map<ShareClass | null, string> {
    const classed: Map<ShareClass, string> = new Map<ShareClass, string>(
        [...amounts].filter((entry: [ShareClass | null, string]): entry is [ShareClass, string] => entry[0] !== null)
    );
    const unit: string | null = classed.has(SHARE_CLASSES.unit) ? null : unitAmount(text, classed);
    return unit === null ? amounts : new Map<ShareClass | null, string>([...amounts, [SHARE_CLASSES.unit, unit]]);
}

function currentWording(text: string): string {
    const restated: RegExpMatchArray | undefined = [...text.matchAll(RESTATEMENT)].at(-1);
    return restated === undefined ? text : text.slice(restated.index);
}

function portugueseBody(rawText: string): string {
    const english: number = rawText.search(ENGLISH_TAIL);
    return english > 0 ? rawText.slice(0, english) : rawText;
}

function runFrom(text: string, anchor: Anchor, count: number): string[] | null {
    const window: string = text.slice(anchor.end, anchor.end + anchor.gap + count * DATE_MAX_LENGTH);
    const dates: DateToken[] = datesOf(window);
    const first: DateToken | undefined = dates[0];
    if (first === undefined || first.start > anchor.gap || SENTENCE_BREAK.test(window.slice(0, first.start))) {
        return null;
    }
    const run: DateToken[] = [first];
    for (const date of dates.slice(1)) {
        if (window.slice(run.at(-1)?.end ?? 0, date.start).trim() !== '') {
            break;
        }
        run.push(date);
    }
    return run.length === count ? run.map((date: DateToken): string => date.iso) : null;
}

function exDatesRun(text: string, count: number): string[] | null {
    const runs: (string[] | null)[] = EX_DATE_RULES.flatMap((rule: { keyword: RegExp; gap: number }): (string[] | null)[] =>
        anchorsOf(text, rule.keyword, rule.gap).map((anchor: Anchor): string[] | null => runFrom(text, anchor, count))
    );
    return runs.find((run: string[] | null): boolean => run !== null) ?? null;
}

function entriesByKind(declared: readonly DeclaredAmount[]): Map<IncomeNotice['kind'], AmountEntry[]> {
    const byKind: Map<IncomeNotice['kind'], AmountEntry[]> = new Map<IncomeNotice['kind'], AmountEntry[]>();
    for (const item of declared) {
        const entries: AmountEntry[] = byKind.get(item.kind) ?? [];
        entries.push({ classes: item.shareClasses, amount: item.amount });
        byKind.set(item.kind, entries);
    }
    return byKind;
}

function singleAmountNotices(
    kind: IncomeNotice['kind'],
    entries: readonly AmountEntry[],
    dates: { exDate: string; paymentDate: string | null }
): IncomeNotice[] {
    return [...amountsByClass(entries)]
        .filter(([, amounts]: [ShareClass | null, Set<string>]): boolean => amounts.size === 1)
        .map(([shareClass, amounts]: [ShareClass | null, Set<string>]): IncomeNotice => ({
            kind,
            exDate: dates.exDate,
            paymentDate: dates.paymentDate,
            amountPerUnit: [...amounts][0] ?? '',
            shareClass
        }));
}

function tableNotices(text: string, declared: readonly DeclaredAmount[]): IncomeNotice[] {
    const exDate: string | null = exDateOf(text);
    if (exDate === null) {
        return [];
    }
    const paymentDate: string | null = paymentDateOf(text, exDate);
    const dates: { exDate: string; paymentDate: string | null } = { exDate, paymentDate };
    return [...entriesByKind(declared)].flatMap(([kind, entries]: [IncomeNotice['kind'], AmountEntry[]]): IncomeNotice[] =>
        singleAmountNotices(kind, entries, dates)
    );
}

function columnNotices(text: string, amounts: readonly string[]): IncomeNotice[] {
    const kind: IncomeNotice['kind'] | null = kindOf(text);
    const exDates: string[] | null = exDatesRun(text, amounts.length);
    if (kind === null || exDates === null || amounts.some((amount: string): boolean => amount.length === 0)) {
        return [];
    }
    return exDates.map((exDate: string, index: number): IncomeNotice => ({
        kind,
        exDate,
        paymentDate: paymentDateOf(text, exDate),
        amountPerUnit: amounts[index] ?? '',
        shareClass: null
    }));
}

export function parseIncomeNotices(rawText: string): IncomeNotice[] {
    const text: string = currentWording(plain(portugueseBody(rawText)));
    const declared: DeclaredAmount[] | null = headerTables(text);
    if (declared !== null) {
        return tableNotices(text, declared);
    }
    const columns: readonly string[] | null = columnAmounts(text);
    if (columns !== null) {
        return columnNotices(text, columns);
    }
    return singleNotices(text);
}

function singleNotices(text: string): IncomeNotice[] {
    const kind: IncomeNotice['kind'] | null = kindOf(text);
    const exDate: string | null = exDateOf(text);
    const found: Map<ShareClass | null, string> | null = grossAmountsByClass(text);
    if (kind === null || exDate === null || found === null) {
        return [];
    }
    const paymentDate: string | null = paymentDateOf(text, exDate);
    return [...withUnit(text, found)].map(([shareClass, amountPerUnit]: [ShareClass | null, string]): IncomeNotice => ({
        kind,
        exDate,
        paymentDate,
        amountPerUnit,
        shareClass
    }));
}
