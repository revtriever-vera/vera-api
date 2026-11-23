import { User } from '../domain/identity.types';

export interface LoginOfferInput {
    readonly token: string;
    readonly user: User;
    readonly isNewAccount: boolean;
    readonly ip: string | null;
}

export interface LoginOfferOutcome {
    readonly redeemed: boolean;
    readonly reason: string | null;
}

export abstract class LoginOfferPort {
    public abstract redeem(input: LoginOfferInput): Promise<LoginOfferOutcome | null>;
}
