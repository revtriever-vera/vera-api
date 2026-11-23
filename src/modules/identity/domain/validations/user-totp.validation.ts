import { TotpAlreadyActiveError, TotpNotEnrolledError } from '../identity.errors';
import { UserTotp } from '../identity.types';

export class UserTotpValidation {
    public static isActive(totp: UserTotp | null): boolean {
        return totp?.activatedAt !== null && totp?.activatedAt !== undefined;
    }

    public static assertEnrollable(totp: UserTotp | null): void {
        if (UserTotpValidation.isActive(totp)) {
            throw new TotpAlreadyActiveError();
        }
    }

    public static assertPending(totp: UserTotp | null): asserts totp is UserTotp {
        if (totp?.activatedAt !== null) {
            throw new TotpNotEnrolledError();
        }
    }

    public static assertActive(totp: UserTotp | null): asserts totp is UserTotp {
        if (!totp?.activatedAt) {
            throw new TotpNotEnrolledError();
        }
    }
}
