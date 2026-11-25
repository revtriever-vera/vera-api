import { mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import type { CurveSeries, Indexer } from '../../../fixed-income/services/index-series-math';
import type { TitleKind, TitleProbe } from '../../../fixed-income/services/fixed-income-title-importer.service';
import { normalizeText } from '../b3/b3-cells';
import { IGNORE_REASONS, ParsedFixedIncome, ParsedInvestmentStatement } from '../investment-statement.types';
import {
    FIXED_INCOME_FACE_UNIT_PRICE,
    FIXED_INCOME_NAME_MAX_LENGTH,
    FIXED_INCOME_REASONS,
    FIXED_INCOME_STATUSES,
    FixedIncomeReason,
    FixedIncomeStatus,
    StoredFixedIncome
} from './fixed-income-import.types';
import { suggestionOf } from './title-suggestion';
import { B3_INDEXERS, INFERENCE_REASONS, inferRate, RateInference } from './rate-inference';

const KIND_BY_PREFIX: Readonly<Record<string, TitleKind>> = {
    CDB: 'cdb',
    LCI: 'lci',
    LCA: 'lca',
    LC: 'lc',
    DEB: 'debenture',
    DEBENTURE: 'debenture',
    CRI: 'cri',
    CRA: 'cra'
};

const PAYMENT_EVENT: RegExp = /juros|amortizacao/;
const PRODUCT_SEPARATOR: string = ' - ';

export interface ProposalContext {
    readonly positionDate: string;
    readonly series: CurveSeries;
    readonly paymentEventCodes: ReadonlySet<string>;
    readonly applicationDates: ReadonlyMap<string, string>;
    readonly matchIssuer: (name: string | null, kind: TitleKind) => string | null;
}

interface Verdict {
    readonly status: FixedIncomeStatus;
    readonly reason: FixedIncomeReason | null;
    readonly indexer: Indexer | null;
    readonly rateBps: number | null;
}

export function kindOfProduct(product: string): TitleKind | null {
    const prefix: string = product.includes(PRODUCT_SEPARATOR) ? (product.split(PRODUCT_SEPARATOR)[0] ?? '') : '';
    return KIND_BY_PREFIX[prefix.trim().toUpperCase()] ?? null;
}

export function paymentEventCodesOf(statement: ParsedInvestmentStatement): Set<string> {
    const codes: Set<string> = new Set();
    for (const line of statement.ignored) {
        if (
            line.reason === IGNORE_REASONS.unsupportedMovement &&
            line.productCode !== null &&
            PAYMENT_EVENT.test(normalizeText(line.description))
        ) {
            codes.add(line.productCode);
        }
    }
    return codes;
}

function earliest(current: string | undefined, candidate: string): string {
    return current === undefined || candidate < current ? candidate : current;
}

export function applicationDatesOf(statement: ParsedInvestmentStatement): Map<string, string> {
    const dates: Map<string, string> = new Map();
    for (const line of statement.ignored) {
        if (line.reason === IGNORE_REASONS.settlement && line.productCode !== null && line.tradeDate !== null) {
            dates.set(line.productCode, earliest(dates.get(line.productCode), line.tradeDate));
        }
    }
    return dates;
}

function issuePriceOf(entry: ParsedFixedIncome): string {
    return entry.unitPrices.issue ?? FIXED_INCOME_FACE_UNIT_PRICE;
}

function appliedMinorOf(entry: ParsedFixedIncome): number {
    return toMinor(mulDecimal(entry.quantity, issuePriceOf(entry)), 'BRL');
}

function inGrace(entry: ParsedFixedIncome): boolean {
    const unavailable: number = Number(entry.unavailableQuantity ?? '0');
    return unavailable > 0 || normalizeText(entry.restrictionReason ?? '').includes('carencia');
}

function knownIndexerOf(entry: ParsedFixedIncome): Indexer | null {
    return entry.indexer === null ? null : (B3_INDEXERS[entry.indexer] ?? null);
}

function verdictOf(entry: ParsedFixedIncome, inference: RateInference, context: ProposalContext): Verdict {
    if (!inference.found) {
        return { status: FIXED_INCOME_STATUSES.needsInput, reason: inference.reason, indexer: knownIndexerOf(entry), rateBps: null };
    }
    const base: Verdict = { status: FIXED_INCOME_STATUSES.check, reason: null, indexer: inference.indexer, rateBps: inference.rateBps };
    const applied: string | undefined = entry.code === null ? undefined : context.applicationDates.get(entry.code);
    if (inGrace(entry)) {
        return { ...base, reason: FIXED_INCOME_REASONS.gracePeriod };
    }
    if (applied !== undefined && applied !== entry.issueDate) {
        return { ...base, reason: FIXED_INCOME_REASONS.applicationDateDiffers };
    }
    if (entry.unitPrices.issue === null) {
        return { ...base, reason: FIXED_INCOME_REASONS.assumedFacePrice };
    }
    if (inference.estimated) {
        return { ...base, reason: FIXED_INCOME_REASONS.estimatedSeries };
    }
    return { ...base, status: FIXED_INCOME_STATUSES.inferred };
}

function inferenceOf(entry: ParsedFixedIncome, context: ProposalContext): RateInference {
    return inferRate({
        indexer: entry.indexer,
        issueDate: entry.issueDate,
        positionDate: context.positionDate,
        issueUnitPrice: issuePriceOf(entry),
        curveUnitPrice: entry.unitPrices.curve,
        series: context.series
    });
}

function decide(entry: ParsedFixedIncome, kind: TitleKind | null, context: ProposalContext): Verdict {
    const blocked: FixedIncomeReason | null = blockReasonOf(entry, kind, context);
    if (blocked !== null) {
        return { status: FIXED_INCOME_STATUSES.needsInput, reason: blocked, indexer: knownIndexerOf(entry), rateBps: null };
    }
    return verdictOf(entry, inferenceOf(entry, context), context);
}

function blockReasonOf(entry: ParsedFixedIncome, kind: TitleKind | null, context: ProposalContext): FixedIncomeReason | null {
    if (kind === null) {
        return FIXED_INCOME_REASONS.unsupportedKind;
    }
    if (entry.code !== null && context.paymentEventCodes.has(entry.code)) {
        return FIXED_INCOME_REASONS.paymentEvent;
    }
    return entry.maturityDate === null ? INFERENCE_REASONS.missingData : null;
}

function proposalOf(entry: ParsedFixedIncome, index: number, context: ProposalContext): StoredFixedIncome {
    const kind: TitleKind | null = kindOfProduct(entry.product);
    const verdict: Verdict = decide(entry, kind, context);
    const complete: boolean = entry.issueDate !== null;
    const fields: Omit<StoredFixedIncome, 'suggestion'> = {
        lineId: `F${String(index + 1)}`,
        product: entry.product,
        issuerName: entry.issuer,
        issuerId: kind === null ? null : context.matchIssuer(entry.issuer, kind),
        kind,
        indexer: verdict.indexer,
        rateBps: verdict.rateBps,
        appliedMinor: complete ? appliedMinorOf(entry) : null,
        appliedAt: entry.issueDate,
        maturityDate: entry.maturityDate,
        status: verdict.status,
        reason: verdict.reason
    };
    return { ...fields, suggestion: suggestionOf(fields) };
}

export function proposalsOf(statement: ParsedInvestmentStatement, context: ProposalContext): StoredFixedIncome[] {
    return statement.fixedIncome.map((entry: ParsedFixedIncome, index: number): StoredFixedIncome => proposalOf(entry, index, context));
}

export function titleNameOf(product: string): string {
    return product.trim().slice(0, FIXED_INCOME_NAME_MAX_LENGTH);
}

export function probeOf(proposal: StoredFixedIncome): TitleProbe | null {
    const reviewable: boolean = proposal.status === FIXED_INCOME_STATUSES.inferred || proposal.status === FIXED_INCOME_STATUSES.check;
    if (!reviewable || proposal.indexer === null || proposal.maturityDate === null || proposal.appliedMinor === null) {
        return null;
    }
    return {
        issuerId: proposal.issuerId,
        name: titleNameOf(proposal.product),
        indexer: proposal.indexer,
        maturityDate: proposal.maturityDate,
        appliedMinor: proposal.appliedMinor
    };
}

export function asDuplicate(proposal: StoredFixedIncome): StoredFixedIncome {
    const marked: Omit<StoredFixedIncome, 'suggestion'> = {
        ...proposal,
        status: FIXED_INCOME_STATUSES.duplicate,
        reason: FIXED_INCOME_REASONS.duplicate
    };
    return { ...marked, suggestion: suggestionOf(marked) };
}

export function countByProposalStatus(proposals: readonly StoredFixedIncome[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const proposal of proposals) {
        counts[proposal.status] = (counts[proposal.status] ?? 0) + 1;
    }
    return counts;
}

const DAYS_BACK_BY_WEEKDAY: Readonly<Record<number, number>> = { 0: 2, 1: 3 };
const DEFAULT_DAYS_BACK: number = 1;
const DAY_MS: number = 86_400_000;

export function defaultPositionDate(today: string): string {
    const time: number = Date.parse(`${today}T00:00:00Z`);
    const back: number = DAYS_BACK_BY_WEEKDAY[new Date(time).getUTCDay()] ?? DEFAULT_DAYS_BACK;
    return new Date(time - back * DAY_MS).toISOString().slice(0, 10);
}
