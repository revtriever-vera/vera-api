import { AccountHint } from './statement-import.types';

export interface SuggestionCandidate {
    readonly id: string;
    readonly institutionName: string | null;
    readonly numberLast4: string | null;
}

const COMBINING_MARKS: RegExp = /\p{M}/gu;
const NON_ALPHANUMERIC: RegExp = /[^a-z0-9]/g;
const MIN_PARTIAL_LENGTH: number = 3;

function institutionKey(name: string): string {
    return name.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(NON_ALPHANUMERIC, '');
}

function sameInstitution(left: string, right: string): boolean {
    const first: string = institutionKey(left);
    const second: string = institutionKey(right);
    const comparable: boolean = Math.min(first.length, second.length) >= MIN_PARTIAL_LENGTH;
    return comparable && (first.includes(second) || second.includes(first));
}

function matches(hint: AccountHint, candidate: SuggestionCandidate): boolean {
    return (
        hint.institution !== null &&
        candidate.institutionName !== null &&
        candidate.numberLast4 === hint.numberLast4 &&
        sameInstitution(candidate.institutionName, hint.institution)
    );
}

export function suggestAccount(hint: AccountHint | null, candidates: readonly SuggestionCandidate[]): string | null {
    if (hint === null || hint.numberLast4 === null) {
        return null;
    }
    const found: SuggestionCandidate[] = candidates.filter((candidate: SuggestionCandidate): boolean => matches(hint, candidate));
    return found.length === 1 ? (found[0]?.id ?? null) : null;
}
