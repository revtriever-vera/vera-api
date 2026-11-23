import { createHash, randomBytes } from 'node:crypto';
import { StatePayloadWire, statePayloadSchema } from '../validation/calendar-state.schemas';
import { STATE_TTL_MS } from './calendar.types';

export interface OAuthStatePayload {
    readonly companyId: string;
    readonly userId: string;
    readonly nonce: string;
    readonly expiresAt: number;
    readonly hint: string | null;
}

export interface Pkce {
    readonly verifier: string;
    readonly challenge: string;
}

export function stateTextOf(payload: Omit<OAuthStatePayload, 'expiresAt'>, now: Date): string {
    const wire: StatePayloadWire = {
        c: payload.companyId,
        u: payload.userId,
        n: payload.nonce,
        e: now.getTime() + STATE_TTL_MS,
        h: payload.hint
    };
    return JSON.stringify(wire);
}

export function readStateText(text: string, now: Date): OAuthStatePayload | null {
    try {
        const parsed: StatePayloadWire = statePayloadSchema.parse(JSON.parse(text));
        return parsed.e > now.getTime()
            ? { companyId: parsed.c, userId: parsed.u, nonce: parsed.n, expiresAt: parsed.e, hint: parsed.h }
            : null;
    } catch {
        return null;
    }
}

export function newPkce(): Pkce {
    const verifier: string = randomBytes(48).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
