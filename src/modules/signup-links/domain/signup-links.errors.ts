import { AppError } from '../../../shared/errors/app.error';

export class SignupLinkNotFoundError extends AppError {
    public constructor() {
        super({
            code: 'signup_links.not_found',
            status: 404,
            detail: 'There is no usable signup link with this token or id.'
        });
    }
}

export class SignupLinkRevokedError extends AppError {
    public constructor() {
        super({
            code: 'signup_links.revoked',
            status: 409,
            detail: 'A revoked signup link cannot be edited.'
        });
    }
}

export class SignupLinkInvalidOfferError extends AppError {
    public constructor(reason: string) {
        super({
            code: 'signup_links.invalid_offer',
            status: 422,
            detail: 'The offer of the link breaks a rule of the platform.',
            meta: { reason }
        });
    }
}

export class RedeemNotOwnerError extends AppError {
    public constructor() {
        super({
            code: 'signup_links.not_owner',
            status: 403,
            detail: 'Only the owner of the account can redeem a signup link.'
        });
    }
}

export class RedeemNotEligibleError extends AppError {
    public constructor(reason: string) {
        super({
            code: 'signup_links.account_not_eligible',
            status: 409,
            detail: 'This account cannot redeem a signup link: it is the platform account, already redeemed one, already paid for Premium or already had a trial.',
            meta: { reason }
        });
    }
}

export class RedeemEmailUnverifiedError extends AppError {
    public constructor() {
        super({
            code: 'signup_links.email_unverified',
            status: 422,
            detail: 'A trial offer needs an email verified by the sign-in provider.'
        });
    }
}

export class RedeemEmailAlreadyUsedError extends AppError {
    public constructor() {
        super({
            code: 'signup_links.email_already_used',
            status: 409,
            detail: 'This email already redeemed a trial offer.'
        });
    }
}

export class RedeemTooManyFromIpError extends AppError {
    public constructor() {
        super({
            code: 'signup_links.too_many_from_ip',
            status: 429,
            detail: 'Too many signup links were redeemed from this IP today.'
        });
    }
}
