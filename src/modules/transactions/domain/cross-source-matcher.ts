import { MAX_CROSS_SOURCE_DAYS } from './transactions.types';
import { daysBetween } from './calendar';

export interface MatchCandidate {
    readonly id: string;
    readonly amountMinor: number;
    readonly date: string;
    readonly createdAt: Date;
}

export interface MatchSubject {
    readonly amountMinor: number;
    readonly date: string;
}

function isCloser(challenger: MatchCandidate, incumbent: MatchCandidate, date: string): boolean {
    const byDistance: number = daysBetween(challenger.date, date) - daysBetween(incumbent.date, date);
    if (byDistance !== 0) {
        return byDistance < 0;
    }
    const byAge: number = challenger.createdAt.getTime() - incumbent.createdAt.getTime();
    return byAge !== 0 ? byAge < 0 : challenger.id < incumbent.id;
}

function bestOf<T extends MatchCandidate>(candidates: readonly T[], date: string): T | null {
    let best: T | null = null;
    for (const candidate of candidates) {
        if (daysBetween(candidate.date, date) <= MAX_CROSS_SOURCE_DAYS && (best === null || isCloser(candidate, best, date))) {
            best = candidate;
        }
    }
    return best;
}

export class CandidatePool<T extends MatchCandidate = MatchCandidate> {
    private readonly byAmount: Map<number, T[]> = new Map<number, T[]>();

    public constructor(candidates: readonly T[]) {
        for (const candidate of candidates) {
            const sameAmount: T[] = this.byAmount.get(candidate.amountMinor) ?? [];
            sameAmount.push(candidate);
            this.byAmount.set(candidate.amountMinor, sameAmount);
        }
    }

    public take(subject: MatchSubject): T | null {
        const candidates: T[] = this.byAmount.get(subject.amountMinor) ?? [];
        const best: T | null = bestOf(candidates, subject.date);
        if (best === null) {
            return null;
        }
        this.byAmount.set(
            subject.amountMinor,
            candidates.filter((candidate: T): boolean => candidate.id !== best.id)
        );
        return best;
    }
}
