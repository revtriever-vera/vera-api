import { createHash } from 'node:crypto';
import type { ProposalPayload } from '../validation/calendar-proposal.schemas';
import { DEFAULT_DURATION_MINUTES, MAX_DURATION_MINUTES, MAX_TITLE_CHARS } from './calendar.types';
import { parseWallClock } from './local-time';

const MINUTE_MS: number = 60_000;
const BASE32_HEX: string = '0123456789abcdefghijklmnopqrstuv';
const ID_HEX_CHARS: number = 40;
const ID_CHARS: number = 32;
const BITS_PER_CHAR: number = 5;
const MASK: bigint = 31n;
const ID_PREFIX: string = 'vera';

export interface ProposalDraft {
    readonly title: string;
    readonly start: string | undefined;
    readonly durationMinutes: number | undefined;
}

export type ProposalEvaluation =
    | { readonly status: 'proposed'; readonly start: Date; readonly end: Date; readonly title: string }
    | { readonly status: 'needs_time' }
    | { readonly status: 'invalid'; readonly reason: 'past' | 'title' };

export function evaluateProposal(draft: ProposalDraft, timeZone: string, now: Date): ProposalEvaluation {
    const title: string = draft.title.replaceAll(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS);
    if (title === '') {
        return { status: 'invalid', reason: 'title' };
    }
    const start: Date | null = draft.start === undefined ? null : parseWallClock(draft.start, timeZone);
    if (start === null) {
        return { status: 'needs_time' };
    }
    if (start.getTime() <= now.getTime()) {
        return { status: 'invalid', reason: 'past' };
    }
    const minutes: number = Math.min(Math.max(draft.durationMinutes ?? DEFAULT_DURATION_MINUTES, 1), MAX_DURATION_MINUTES);
    return { status: 'proposed', title, start, end: new Date(start.getTime() + minutes * MINUTE_MS) };
}

export function startsInFuture(payload: ProposalPayload, now: Date): boolean {
    return new Date(payload.start).getTime() > now.getTime();
}

export function googleEventIdOf(proposalId: string): string {
    const digest: bigint = BigInt(`0x${createHash('sha256').update(proposalId).digest('hex').slice(0, ID_HEX_CHARS)}`);
    const chars: string[] = Array.from({ length: ID_CHARS }, (_unused: unknown, index: number): string => {
        const shift: bigint = BigInt(BITS_PER_CHAR * (ID_CHARS - 1 - index));
        return BASE32_HEX.charAt(Number((digest >> shift) & MASK));
    });
    return `${ID_PREFIX}${chars.join('')}`;
}
