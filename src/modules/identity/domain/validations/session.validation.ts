import { InvalidRefreshTokenError } from '../identity.errors';
import { Session } from '../identity.types';

export class SessionValidation {
    public static isReused(session: Session): boolean {
        return session.replacedById !== null;
    }

    public static assertActive(session: Session): void {
        if (session.revokedAt !== null || session.expiresAt.getTime() < Date.now()) {
            throw new InvalidRefreshTokenError();
        }
    }

    public static assertRefreshable(session: Session | null): asserts session is Session {
        if (!session) {
            throw new InvalidRefreshTokenError();
        }
    }
}
