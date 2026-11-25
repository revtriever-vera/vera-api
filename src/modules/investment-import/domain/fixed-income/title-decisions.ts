import type { ImportedTitleDraft, TitleProbe } from '../../../fixed-income/services/fixed-income-title-importer.service';
import { DuplicateTitleError, FixedIncomeIncompleteError, InvalidEditError } from '../investment-import.errors';
import {
    FIXED_INCOME_STATUSES,
    FixedIncomeDecision,
    FixedIncomeOutcome,
    FixedIncomeTitleEdits,
    StoredFixedIncome
} from './fixed-income-import.types';
import { titleNameOf } from './title-proposal';

export interface PlannedTitle {
    readonly lineId: string;
    readonly draft: ImportedTitleDraft;
    readonly forced: boolean;
}

const REQUIRED: readonly (keyof ImportedTitleDraft)[] = ['name', 'kind', 'indexer', 'rateBps', 'appliedMinor', 'appliedAt', 'maturityDate'];

function indexDecisions(stored: readonly StoredFixedIncome[], decisions: readonly FixedIncomeDecision[]): Map<string, FixedIncomeDecision> {
    const known: ReadonlySet<string> = new Set(stored.map((entry: StoredFixedIncome): string => entry.lineId));
    const byLine: Map<string, FixedIncomeDecision> = new Map();
    for (const decision of decisions) {
        if (!known.has(decision.lineId)) {
            throw new InvalidEditError(decision.lineId, 'unknown_line');
        }
        if (byLine.has(decision.lineId)) {
            throw new InvalidEditError(decision.lineId, 'repeated_line');
        }
        byLine.set(decision.lineId, decision);
    }
    return byLine;
}

function firstDefined<T>(...values: readonly (T | null | undefined)[]): T | undefined {
    return values.find((value: T | null | undefined): value is T => value !== undefined && value !== null);
}

function fieldsOf(entry: StoredFixedIncome, edits: FixedIncomeTitleEdits): Partial<ImportedTitleDraft> {
    return {
        name: firstDefined(edits.name, titleNameOf(entry.product)),
        kind: firstDefined(edits.kind, entry.kind),
        issuerId: edits.issuerId === undefined ? entry.issuerId : edits.issuerId,
        indexer: firstDefined(edits.indexer, entry.indexer),
        rateBps: firstDefined(edits.rateBps, entry.rateBps),
        appliedMinor: firstDefined(edits.appliedMinor, entry.appliedMinor),
        appliedAt: firstDefined(edits.appliedAt, entry.appliedAt),
        maturityDate: firstDefined(edits.maturityDate, entry.maturityDate)
    };
}

function completed(lineId: string, fields: Partial<ImportedTitleDraft>): ImportedTitleDraft {
    const missing: string[] = REQUIRED.filter((key: keyof ImportedTitleDraft): boolean => fields[key] === undefined);
    if (missing.length > 0) {
        throw new FixedIncomeIncompleteError(lineId, missing);
    }
    return { ...fields, issuerId: fields.issuerId ?? null } as ImportedTitleDraft;
}

function planOne(entry: StoredFixedIncome, decision: FixedIncomeDecision): PlannedTitle | null {
    if (decision.skip === true) {
        return null;
    }
    if (decision.edits !== undefined) {
        return { lineId: entry.lineId, draft: completed(entry.lineId, fieldsOf(entry, decision.edits)), forced: true };
    }
    if (entry.status === FIXED_INCOME_STATUSES.duplicate) {
        throw new DuplicateTitleError(entry.lineId);
    }
    return { lineId: entry.lineId, draft: completed(entry.lineId, fieldsOf(entry, {})), forced: false };
}

export function planTitles(stored: readonly StoredFixedIncome[], decisions: readonly FixedIncomeDecision[]): PlannedTitle[] {
    const byLine: Map<string, FixedIncomeDecision> = indexDecisions(stored, decisions);
    const planned: PlannedTitle[] = [];
    for (const entry of stored) {
        const decision: FixedIncomeDecision | undefined = byLine.get(entry.lineId);
        const title: PlannedTitle | null = decision === undefined ? null : planOne(entry, decision);
        if (title !== null) {
            planned.push(title);
        }
    }
    return planned;
}

export function outcomesOf(planned: readonly PlannedTitle[], ids: readonly string[]): FixedIncomeOutcome[] {
    return planned.map((title: PlannedTitle, index: number): FixedIncomeOutcome => ({
        lineId: title.lineId,
        titleId: ids[index] as string
    }));
}

export function probeOfDraft(draft: ImportedTitleDraft): TitleProbe {
    return {
        issuerId: draft.issuerId,
        name: draft.name,
        indexer: draft.indexer,
        maturityDate: draft.maturityDate,
        appliedMinor: draft.appliedMinor
    };
}
