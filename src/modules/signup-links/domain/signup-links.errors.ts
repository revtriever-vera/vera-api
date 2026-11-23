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
