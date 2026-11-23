import { LINK_STATUSES, LinkStatus, SignupLink } from './signup-links.types';

export function statusOf(link: SignupLink, now: Date): LinkStatus {
    if (link.revokedAt !== null) {
        return LINK_STATUSES.revoked;
    }
    if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) {
        return LINK_STATUSES.expired;
    }
    if (link.maxUses !== null && link.redemptionCount >= link.maxUses) {
        return LINK_STATUSES.exhausted;
    }
    return LINK_STATUSES.active;
}
