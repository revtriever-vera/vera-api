import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { APP_LOCALES } from '../../../shared/i18n/locale';
import { LOGIN_PROVIDERS, USER_ROLES } from '../domain/identity.types';

export const authUserSchema = z.object({
    id: z.string().uuid().describe('User id'),
    name: z.string().describe('User display name'),
    email: z.string().describe('User email'),
    role: z.nativeEnum(USER_ROLES).describe('`owner` runs the company; `member` is reserved for invited teammates'),
    companyId: z.string().uuid().describe('Company the user belongs to')
});

export const sessionResponseSchema = z.object({
    outcome: z.literal('authenticated').describe('The refresh token was valid and the session was rotated'),
    accessToken: z.string().describe('JWT access token (~10 min TTL) — send as Authorization: Bearer'),
    user: authUserSchema
});

export const loginResponseSchema = sessionResponseSchema.extend({
    outcome: z.literal('authenticated').describe('The provider credential was verified and a session was issued'),
    isNewAccount: z.boolean().describe('True when this login created the company and the user')
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const googleLoginSchema = z.object({ idToken: z.string().min(20).describe('Google Identity Services ID token (JWT)') }).strict();

export class GoogleLoginDto extends createZodDto(googleLoginSchema) {}

export const facebookLoginSchema = z.object({ accessToken: z.string().min(20).describe('Facebook JS SDK user access token') }).strict();

export class FacebookLoginDto extends createZodDto(facebookLoginSchema) {}

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const meResponseSchema = z.object({
    userId: z.string().uuid().describe('Authenticated user id'),
    companyId: z.string().uuid().describe('Tenant of the current session'),
    name: z.string().describe('User display name'),
    email: z.string().describe('User email'),
    role: z.nativeEnum(USER_ROLES).describe('Role inside the company'),
    locale: z.enum(APP_LOCALES).describe('Effective locale: the personal preference when set, otherwise the company locale'),
    preferredLocale: z.enum(APP_LOCALES).nullable().describe('Personal locale preference; null follows the company locale'),
    loginProvider: z.nativeEnum(LOGIN_PROVIDERS).describe('Provider the current session signed in with'),
    companyName: z.string().describe('Name of the current tenant')
});

export const updatePreferencesSchema = z
    .object({
        locale: z.enum(APP_LOCALES).nullable().optional().describe('Personal locale preference; null follows the company locale')
    })
    .strict();

export class UpdatePreferencesDto extends createZodDto(updatePreferencesSchema) {}
