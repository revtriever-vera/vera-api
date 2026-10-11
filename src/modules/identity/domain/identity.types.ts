import { Insertable, Selectable } from 'kysely';
import { AuthIdentities, Companies, Sessions, Users } from '../../../core/database/generated/database.types';
import { AppLocale } from '../../../shared/i18n/locale';

export type Company = Selectable<Companies>;
export type User = Selectable<Users>;
export type Session = Selectable<Sessions>;
export type AuthIdentity = Selectable<AuthIdentities>;

export type NewCompany = Insertable<Companies>;
export type NewUser = Insertable<Users>;
export type NewSession = Insertable<Sessions>;
export type NewAuthIdentity = Insertable<AuthIdentities>;

export const USER_ROLES = {
    owner: 'owner',
    member: 'member'
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const LOGIN_PROVIDERS = {
    google: 'google',
    facebook: 'facebook'
} as const;

export type LoginProvider = (typeof LOGIN_PROVIDERS)[keyof typeof LOGIN_PROVIDERS];

export interface SocialIdentity {
    readonly provider: LoginProvider;
    readonly subject: string;
    readonly email: string | null;
    readonly emailVerified: boolean;
    readonly name: string | null;
}

export const LOGIN_OUTCOMES = {
    success: 'success',
    newAccount: 'new_account',
    linked: 'linked',
    failed: 'failed'
} as const;

export type LoginOutcome = (typeof LOGIN_OUTCOMES)[keyof typeof LOGIN_OUTCOMES];

export const TOKEN_PURPOSES = {
    access: 'access'
} as const;

export type TokenPurpose = (typeof TOKEN_PURPOSES)[keyof typeof TOKEN_PURPOSES];

export function effectiveLocale(user: Pick<User, 'locale'>, company: Pick<Company, 'locale'>): AppLocale {
    return (user.locale ?? company.locale) as AppLocale;
}

export const REFRESH_OUTCOMES = {
    success: 'success',
    invalid: 'invalid',
    reused: 'reused'
} as const;

export type RefreshOutcome = (typeof REFRESH_OUTCOMES)[keyof typeof REFRESH_OUTCOMES];
