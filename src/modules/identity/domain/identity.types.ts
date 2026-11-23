import { Insertable, Selectable } from 'kysely';
import {
    AccountDeletionLog,
    AccountInvites,
    AuthIdentities,
    Companies,
    PlatformAuditLog,
    Sessions,
    UserRecoveryCodes,
    Users,
    UserTotps
} from '../../../core/database/generated/database.types';
import { AppLocale } from '../../../shared/i18n/locale';

export type Company = Selectable<Companies>;
export type User = Selectable<Users>;
export type Session = Selectable<Sessions>;
export type AuthIdentity = Selectable<AuthIdentities>;
export type AccountDeletionRecord = Selectable<AccountDeletionLog>;

export type NewCompany = Insertable<Companies>;
export type NewUser = Insertable<Users>;
export type NewSession = Insertable<Sessions>;
export type NewAuthIdentity = Insertable<AuthIdentities>;
export type NewAccountDeletionRecord = Insertable<AccountDeletionLog>;
export type PlatformAuditEntry = Selectable<PlatformAuditLog>;
export type NewPlatformAuditEntry = Insertable<PlatformAuditLog>;
export type AccountInvite = Selectable<AccountInvites>;
export type NewAccountInvite = Insertable<AccountInvites>;
export type UserTotp = Selectable<UserTotps>;
export type NewUserTotp = Insertable<UserTotps>;
export type UserRecoveryCode = Selectable<UserRecoveryCodes>;
export type NewUserRecoveryCode = Insertable<UserRecoveryCodes>;

export const USER_ROLES = {
    owner: 'owner',
    editor: 'editor',
    viewer: 'viewer'
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ROLE_RANK: Readonly<Record<UserRole, number>> = {
    viewer: 1,
    editor: 2,
    owner: 3
};

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
    joined: 'joined',
    failed: 'failed'
} as const;

export type LoginOutcome = (typeof LOGIN_OUTCOMES)[keyof typeof LOGIN_OUTCOMES];

export const LOGIN_AUDIENCES = {
    app: 'app',
    admin: 'admin'
} as const;

export type LoginAudience = (typeof LOGIN_AUDIENCES)[keyof typeof LOGIN_AUDIENCES];

export const PLATFORM_AUDIT_ACTIONS = {
    login: 'admin.login',
    created: 'admin.created',
    denied: 'admin.denied',
    totpEnrolled: 'admin.totp_enrolled',
    recoveryCodeUsed: 'admin.recovery_code_used',
    totpLocked: 'admin.totp_locked',
    totpReset: 'admin.totp_reset',
    signupLinkCreated: 'signup_link.created',
    signupLinkUpdated: 'signup_link.updated',
    signupLinkRevoked: 'signup_link.revoked',
    accountViewed: 'account.viewed'
} as const;

export type PlatformAuditAction = (typeof PLATFORM_AUDIT_ACTIONS)[keyof typeof PLATFORM_AUDIT_ACTIONS];

export const PLATFORM_SEED_OUTCOMES = {
    created: 'created',
    unchanged: 'unchanged'
} as const;

export type PlatformSeedOutcome = (typeof PLATFORM_SEED_OUTCOMES)[keyof typeof PLATFORM_SEED_OUTCOMES];

export const PLATFORM_TOTP_RESET_OUTCOMES = {
    reset: 'reset',
    notFound: 'not_found'
} as const;

export type PlatformTotpResetOutcome = (typeof PLATFORM_TOTP_RESET_OUTCOMES)[keyof typeof PLATFORM_TOTP_RESET_OUTCOMES];

export const PLATFORM_COMPANY_NAME: string = 'Vera (sistema)';

export const TOKEN_PURPOSES = {
    access: 'access',
    totpChallenge: 'totp_challenge',
    totpEnrollment: 'totp_enrollment'
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

export interface ErasedArea {
    readonly area: string;
    readonly erased: number;
}

export const ACCOUNT_EXPORT_FORMAT: string = 'vera-export/1';

export const ACCOUNT_DELETION_OUTCOMES = {
    success: 'success',
    erasureFailed: 'erasure_failed',
    mismatch: 'mismatch'
} as const;

export type AccountDeletionOutcome = (typeof ACCOUNT_DELETION_OUTCOMES)[keyof typeof ACCOUNT_DELETION_OUTCOMES];

export const ACCOUNT_EXPORT_OUTCOMES = {
    success: 'success',
    failed: 'failed'
} as const;

export type AccountExportOutcome = (typeof ACCOUNT_EXPORT_OUTCOMES)[keyof typeof ACCOUNT_EXPORT_OUTCOMES];

export const INVITE_OUTCOMES = {
    sent: 'sent',
    accepted: 'accepted',
    expired: 'expired',
    revoked: 'revoked',
    mismatch: 'mismatch',
    notEmpty: 'not_empty'
} as const;

export type InviteOutcome = (typeof INVITE_OUTCOMES)[keyof typeof INVITE_OUTCOMES];

export const MEMBER_CHANGE_KINDS = {
    roleChanged: 'role_changed',
    removed: 'removed',
    left: 'left'
} as const;

export type MemberChangeKind = (typeof MEMBER_CHANGE_KINDS)[keyof typeof MEMBER_CHANGE_KINDS];
