import { randomBytes } from 'node:crypto';
import { HashUtil } from '../../../shared/utils/hash.util';
import { AccountInvite } from './identity.types';

const DAY_MS: number = 24 * 60 * 60 * 1000;
const INVITE_TOKEN_BYTES: number = 32;
const MASK: string = '***';

export function inviteExpiryFrom(now: Date, ttlDays: number): Date {
    return new Date(now.getTime() + ttlDays * DAY_MS);
}

export function isInviteExpired(invite: Pick<AccountInvite, 'expiresAt'>, now: Date): boolean {
    return invite.expiresAt.getTime() <= now.getTime();
}

export function isInviteUsable(invite: Pick<AccountInvite, 'expiresAt' | 'acceptedAt' | 'revokedAt'>, now: Date): boolean {
    return invite.acceptedAt === null && invite.revokedAt === null && !isInviteExpired(invite, now);
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function maskEmail(email: string): string {
    const [local = '', domain = ''] = normalizeEmail(email).split('@');
    return `${local.slice(0, 1)}${MASK}@${domain}`;
}

export interface InviteToken {
    readonly raw: string;
    readonly hash: string;
}

export function newInviteToken(): InviteToken {
    const raw: string = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
    return { raw, hash: HashUtil.sha256(raw) };
}

export function hashInviteToken(raw: string): string {
    return HashUtil.sha256(raw);
}
