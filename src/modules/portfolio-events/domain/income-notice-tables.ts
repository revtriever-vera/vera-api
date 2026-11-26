import { EVENT_KINDS, SHARE_CLASSES, ShareClass, shareClassOfTicker } from './portfolio-events.types';

export type IncomeKind = typeof EVENT_KINDS.dividend | typeof EVENT_KINDS.jcp;

export interface DeclaredAmount {
    readonly kind: IncomeKind;
    readonly shareClasses: readonly ShareClass[];
    readonly amount: string;
}

export interface AmountRun {
    readonly start: number;
    readonly amounts: readonly string[];
}

export const AMOUNT_TOKEN: RegExp = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+)/g;
export const NET_BEFORE: RegExp = /l[íi]quid[oa][^R]{0,30}$/i;

const COLUMN_MARKER: RegExp = /\bTotal\b|\bpor\s+(?:a[çc][ãa]o|units?)\b/gi;
const TICKER_LIST: RegExp = /^\s?[A-Z]{4}\d{1,2}(?:\s?[/,e]\s?[A-Z]{4}\d{1,2})*/;
const TICKER: RegExp = /[A-Z]{4}\d{1,2}/g;
const JCP_HEADER: RegExp = /juros\s+sobre\s+(?:o\s+)?capital\s+pr[óo]prio|\bJCP\b/i;
const DIVIDEND_HEADER: RegExp = /dividendo/i;
const PER_SHARE_LABEL: RegExp = /por\s+a[çc][ãa]o\s*$/i;
const HEADER_LOOKBACK: number = 500;
const LABEL_LOOKBEHIND: number = 70;
const COLUMN_RUN_MIN: number = 2;

export function decimalOf(brazilian: string): string {
    return brazilian.replaceAll('.', '').replace(',', '.');
}

/** A per-share amount never has thousands separators; a total in reais does. */
export function isPerShareMagnitude(brazilian: string): boolean {
    return !brazilian.includes('.');
}

export function amountRuns(text: string): AmountRun[] {
    const runs: { start: number; end: number; amounts: string[] }[] = [];
    for (const match of text.matchAll(AMOUNT_TOKEN)) {
        const last: { start: number; end: number; amounts: string[] } | undefined = runs.at(-1);
        const amount: string = match[1] ?? '';
        if (last === undefined || text.slice(last.end, match.index).trim() !== '') {
            runs.push({ start: match.index, end: match.index + match[0].length, amounts: [amount] });
            continue;
        }
        last.amounts.push(amount);
        last.end = match.index + match[0].length;
    }
    return runs.filter((run: AmountRun): boolean => run.amounts.length >= COLUMN_RUN_MIN);
}

function classesOfColumn(text: string, marker: RegExpExecArray): ShareClass[] {
    const label: string = marker[0].toLowerCase();
    if (label.endsWith('unit') || label.endsWith('units')) {
        return [SHARE_CLASSES.unit];
    }
    const tickers: string = TICKER_LIST.exec(text.slice(marker.index + marker[0].length))?.[0] ?? '';
    return [...tickers.matchAll(TICKER)]
        .map((ticker: RegExpExecArray): ShareClass | null => shareClassOfTicker(ticker[0]))
        .filter((shareClass: ShareClass | null): shareClass is ShareClass => shareClass !== null);
}

function kindOfHeader(header: string): IncomeKind | null {
    const jcp: boolean = JCP_HEADER.test(header);
    const dividend: boolean = DIVIDEND_HEADER.test(header);
    if (jcp === dividend) {
        return null;
    }
    return jcp ? EVENT_KINDS.jcp : EVENT_KINDS.dividend;
}

function columnsOf(text: string, run: AmountRun): DeclaredAmount[] | null {
    const lookback: string = text.slice(Math.max(0, run.start - HEADER_LOOKBACK), run.start);
    const markers: RegExpExecArray[] = [...lookback.matchAll(COLUMN_MARKER)].slice(-run.amounts.length);
    const first: RegExpExecArray | undefined = markers[0];
    if (first === undefined || markers.length !== run.amounts.length || new RegExp(AMOUNT_TOKEN.source).test(lookback.slice(first.index))) {
        return null;
    }
    const kind: IncomeKind | null = kindOfHeader(lookback.slice(first.index));
    const declared: DeclaredAmount[] = markers.flatMap((marker: RegExpExecArray, index: number): DeclaredAmount[] => {
        const amount: string = run.amounts[index] ?? '';
        const perShare: boolean = !/^total$/i.test(marker[0]) && isPerShareMagnitude(amount);
        return kind === null || !perShare ? [] : [{ kind, shareClasses: classesOfColumn(lookback, marker), amount: decimalOf(amount) }];
    });
    return declared;
}

/**
 * Tables that write the column titles first and the values after them (Taesa): the title of each column says whether
 * the value is the total or the amount per share/Unit, and the title of the table says dividend or JCP. A table whose
 * titles do not line up with its values, or whose kind is mixed, makes no declaration.
 * Returns null when the text has no such table.
 */
export function headerTables(text: string): DeclaredAmount[] | null {
    const tables: DeclaredAmount[][] = amountRuns(text)
        .map((run: AmountRun): DeclaredAmount[] | null => columnsOf(text, run))
        .filter((table: DeclaredAmount[] | null): table is DeclaredAmount[] => table !== null);
    return tables.length === 0 ? null : tables.flat();
}

/**
 * A row "Valor bruto por ação R$ a R$ b" with one value per declaration (Itaú: two JCP in the same notice).
 * Returns null when the text has no such row.
 */
export function columnAmounts(text: string): readonly string[] | null {
    const run: AmountRun | undefined = amountRuns(text).find((candidate: AmountRun): boolean => {
        const before: string = text.slice(Math.max(0, candidate.start - LABEL_LOOKBEHIND), candidate.start);
        return PER_SHARE_LABEL.test(before.trimEnd()) && !NET_BEFORE.test(before);
    });
    return run === undefined ? null : run.amounts.map(decimalOf);
}
