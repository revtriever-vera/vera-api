import { AppError } from '../../../shared/errors/app.error';

export class InviteInvalidError extends AppError {
    public constructor() {
        super({
            code: 'invites.invalid',
            status: 410,
            detail: 'The invite does not exist, expired, was revoked or was already used.'
        });
    }
}

export class InviteEmailMismatchError extends AppError {
    public constructor() {
        super({
            code: 'invites.email_mismatch',
            status: 409,
            detail: 'The verified email of the signed-in identity is not the email the invite was sent to.'
        });
    }
}

export class InviteNotFoundError extends AppError {
    public constructor() {
        super({
            code: 'invites.not_found',
            status: 404,
            detail: 'There is no pending invite with this id in the account.'
        });
    }
}

export class AlreadyMemberError extends AppError {
    public constructor() {
        super({
            code: 'invites.already_member',
            status: 409,
            detail: 'The email already belongs to a person of this account.'
        });
    }
}

export class MembersLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'members.limit_reached',
            status: 409,
            detail: 'The account reached the limit of people, counting pending invites.',
            meta: { limit }
        });
    }
}

export class AccountNotEmptyError extends AppError {
    public constructor() {
        super({
            code: 'members.account_not_empty',
            status: 409,
            detail: 'The person already has an account with data or with other people; export and delete it before joining another.'
        });
    }
}

export class LastOwnerError extends AppError {
    public constructor() {
        super({
            code: 'members.last_owner',
            status: 409,
            detail: 'The account cannot be left without an owner.'
        });
    }
}

export class CannotRemoveSelfError extends AppError {
    public constructor() {
        super({
            code: 'members.cannot_remove_self',
            status: 400,
            detail: 'A person leaves the account by themselves through the leave endpoint, not by removing themselves.'
        });
    }
}

export class MemberNotFoundError extends AppError {
    public constructor() {
        super({
            code: 'members.not_found',
            status: 404,
            detail: 'There is no active person with this id in the account.'
        });
    }
}
