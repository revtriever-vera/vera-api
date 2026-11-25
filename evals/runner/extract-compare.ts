import { z } from 'zod';

export const extractCaseSchema = z.object({
    id: z.string(),
    task: z.literal('investment_extract'),
    mode: z.enum(['text', 'scanned']),
    file: z.string(),
    expected: z.string(),
    sections: z.array(z.enum(['period', 'operations', 'income', 'positions', 'taxWithholdings', 'cashMovements'])).min(1)
});

export type ExtractCase = z.infer<typeof extractCaseSchema>;
export type ExtractSection = ExtractCase['sections'][number];

interface Answer {
    readonly periodStart?: unknown;
    readonly periodEnd?: unknown;
    readonly operations?: readonly Record<string, unknown>[];
    readonly positions?: readonly Record<string, unknown>[];
    readonly taxWithholdings?: readonly Record<string, unknown>[];
    readonly cashMovements?: readonly Record<string, unknown>[];
}

export interface SectionResult {
    readonly section: ExtractSection;
    readonly passed: boolean;
    readonly missing: number;
    readonly extra: number;
    readonly diffs: readonly string[];
}

function keyOf(item: Record<string, unknown>, fields: readonly string[]): string {
    return fields.map((field: string): string => String(item[field] ?? '')).join('|');
}

function numberOf(value: unknown): string {
    return value === undefined || value === null || value === '' ? '' : String(Number(value));
}

function normalized(item: Record<string, unknown>): Record<string, unknown> {
    return {
        ...item,
        ticker: String(item['ticker'] ?? item['symbol'] ?? '').toUpperCase(),
        symbol: String(item['symbol'] ?? '').toUpperCase(),
        quantity: numberOf(item['quantity']),
        unitPrice: numberOf(item['unitPrice']),
        price: numberOf(item['price'])
    };
}

const OPERATION_FIELDS: readonly string[] = ['kind', 'tradeDate', 'ticker', 'quantity', 'unitPrice'];

function listOf(
    answer: Answer,
    section: ExtractSection
): { readonly items: readonly Record<string, unknown>[]; readonly fields: readonly string[] } {
    const income: boolean = section === 'income';
    switch (section) {
        case 'operations':
        case 'income':
            return {
                items: (answer.operations ?? []).filter((item: Record<string, unknown>): boolean => (item['kind'] === 'income') === income),
                fields: OPERATION_FIELDS
            };
        case 'positions':
            return { items: answer.positions ?? [], fields: ['block', 'symbol', 'quantity', 'price'] };
        case 'taxWithholdings':
            return { items: answer.taxWithholdings ?? [], fields: ['tradeDate', 'ticker', 'amountMinor'] };
        default:
            return { items: answer.cashMovements ?? [], fields: ['tradeDate', 'direction', 'amountMinor'] };
    }
}

function indexOf(items: readonly Record<string, unknown>[], fields: readonly string[]): Map<string, unknown> {
    return new Map(
        items.map((item: Record<string, unknown>): [string, unknown] => [keyOf(normalized(item), fields), comparableGross(item)])
    );
}

function comparableGross(item: Record<string, unknown>): unknown {
    return item['market'] === 'equities' || item['market'] === undefined ? (item['grossMinor'] ?? null) : null;
}

function grossDiffers(left: unknown, right: unknown): boolean {
    return left !== null && right !== null && left !== undefined && right !== undefined && Number(left) !== Number(right);
}

function compareList(section: ExtractSection, expected: Answer, actual: Answer): SectionResult {
    const want = listOf(expected, section);
    const wanted: Map<string, unknown> = indexOf(want.items, want.fields);
    const found: Map<string, unknown> = indexOf(listOf(actual, section).items, want.fields);
    const wrongGross: string[] = [...wanted.keys()].filter(
        (key: string): boolean => found.has(key) && grossDiffers(wanted.get(key), found.get(key))
    );
    const missing: string[] = [...wanted.keys()].filter((key: string): boolean => !found.has(key) || wrongGross.includes(key));
    const extra: string[] = [...found.keys()].filter((key: string): boolean => !wanted.has(key) || wrongGross.includes(key));
    return {
        section,
        passed: missing.length === 0 && extra.length === 0,
        missing: missing.length,
        extra: extra.length,
        diffs: [...missing.map((key: string): string => `- ${key}`), ...extra.map((key: string): string => `+ ${key}`)]
    };
}

export function compareAnswers(sections: readonly ExtractSection[], expected: Answer, actual: Answer): SectionResult[] {
    return sections.map((section: ExtractSection): SectionResult => {
        if (section !== 'period') {
            return compareList(section, expected, actual);
        }
        const same: boolean = expected.periodStart === actual.periodStart && expected.periodEnd === actual.periodEnd;
        return { section, passed: same, missing: same ? 0 : 1, extra: 0, diffs: [] };
    });
}
