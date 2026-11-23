import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { authUserSchema, loginResponseSchema } from './auth.schemas';

export const totpRequiredResponseSchema = z.object({
    outcome: z.literal('totp_required').describe('The person has an authenticator: send the code to POST /auth/totp/verify'),
    challengeToken: z.string().describe('Short-lived token (5 min) that only POST /auth/totp/verify accepts')
});

export const totpEnrollmentRequiredResponseSchema = z.object({
    outcome: z
        .literal('totp_enrollment_required')
        .describe('The person has no authenticator yet: enroll it with POST /auth/totp/enroll and POST /auth/totp/activate'),
    setupToken: z.string().describe('Short-lived token (15 min) that only the enroll and activate endpoints accept')
});

export const googleLoginResponseSchema = z.union([loginResponseSchema, totpRequiredResponseSchema, totpEnrollmentRequiredResponseSchema]);

export type GoogleLoginResponse = z.infer<typeof googleLoginResponseSchema>;

export const enrollTotpSchema = z.object({ setupToken: z.string().min(20).describe('`setupToken` returned by the admin login') }).strict();

export class EnrollTotpDto extends createZodDto(enrollTotpSchema) {}

export const enrollTotpResponseSchema = z.object({
    secret: z.string().describe('Base32 secret, for typing into the authenticator app by hand'),
    otpauthUri: z.string().describe('`otpauth://` URI to render as the QR code (issuer "Vera admin")')
});

export const activateTotpSchema = z
    .object({
        setupToken: z.string().min(20).describe('`setupToken` returned by the admin login'),
        code: z.string().trim().length(6).describe('First six-digit code shown by the authenticator app')
    })
    .strict();

export class ActivateTotpDto extends createZodDto(activateTotpSchema) {}

export const activateTotpResponseSchema = z.object({
    outcome: z.literal('authenticated').describe('The authenticator is active and a platform session was issued'),
    accessToken: z.string().describe('JWT access token with the `platform` claim — send as Authorization: Bearer'),
    user: authUserSchema,
    recoveryCodes: z.array(z.string()).describe('Ten single-use recovery codes, shown only now; the server keeps only their hash')
});

export const verifyTotpSchema = z
    .object({
        challengeToken: z.string().min(20).describe('`challengeToken` returned by the admin login'),
        code: z.string().trim().min(6).max(32).describe('Six-digit authenticator code (current or previous 30 s window) or a recovery code')
    })
    .strict();

export class VerifyTotpDto extends createZodDto(verifyTotpSchema) {}

export const verifyTotpResponseSchema = z.object({
    outcome: z.literal('authenticated').describe('The second factor was accepted and a platform session was issued'),
    accessToken: z.string().describe('JWT access token with the `platform` claim — send as Authorization: Bearer'),
    user: authUserSchema
});

export type EnrollTotpResponse = z.infer<typeof enrollTotpResponseSchema>;
export type ActivateTotpResponse = z.infer<typeof activateTotpResponseSchema>;
export type VerifyTotpResponse = z.infer<typeof verifyTotpResponseSchema>;
export type TotpRequiredResponse = z.infer<typeof totpRequiredResponseSchema>;
export type TotpEnrollmentRequiredResponse = z.infer<typeof totpEnrollmentRequiredResponseSchema>;
