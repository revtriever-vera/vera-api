export const AGENDA_KINDS = [
    'dividend',
    'jcp',
    'fii_income',
    'amortization',
    'assembly',
    'earnings_release',
    'fixed_income_maturity',
    'treasury_maturity'
] as const;
export type AgendaKind = (typeof AGENDA_KINDS)[number];

const AGENDA_INCOME_KINDS: ReadonlySet<AgendaKind> = new Set<AgendaKind>(['dividend', 'jcp', 'fii_income', 'amortization']);

export function isIncomeKind(kind: AgendaKind): boolean {
    return AGENDA_INCOME_KINDS.has(kind);
}
export const AGENDA_ASSEMBLY_KIND: AgendaKind = 'assembly';
export const AGENDA_FIXED_INCOME_MATURITY: AgendaKind = 'fixed_income_maturity';
export const AGENDA_TREASURY_MATURITY: AgendaKind = 'treasury_maturity';
export const AGENDA_MAX_DAYS: number = 366;

export const WATCH_NOTICE_TYPES = {
    exDateTomorrow: 'portfolio_ex_date_tomorrow',
    paymentToday: 'portfolio_payment_today',
    assemblySoon: 'portfolio_assembly_soon',
    fixedIncomeMaturitySoon: 'fixed_income_maturity_soon'
} as const;

export const WATCH_DIGEST_TEMPLATE: string = 'portfolio-watch-digest';
export const ASSEMBLY_NOTICE_DAYS: number = 3;
export const MATURITY_NOTICE_DAYS: number = 15;

export interface AgendaItem {
    readonly id: string;
    readonly kind: AgendaKind;
    readonly assetId: string | null;
    readonly holdingId: string | null;
    readonly name: string;
    readonly date: string;
    readonly exDate: string | null;
    readonly paymentDate: string | null;
    readonly eventDate: string | null;
    readonly amountPerUnit: string | null;
    readonly currency: string;
    readonly amountForAccountMinor: number | null;
    readonly estimated: boolean;
    readonly documentUrl: string | null;
}

export interface AgendaWindow {
    readonly from: string;
    readonly to: string;
}
