import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ACCOUNT_EXPORT_FORMAT } from '../domain/identity.types';

export const deleteAccountSchema = z
    .object({ confirmEmail: z.string().email().describe('Email of the signed-in user, typed again to confirm the deletion') })
    .strict();

export class DeleteAccountDto extends createZodDto(deleteAccountSchema) {}

export const accountExportSchema = z.object({
    format: z.literal(ACCOUNT_EXPORT_FORMAT).describe('Version of the export layout'),
    exportedAt: z.string().datetime().describe('When the file was produced (ISO 8601)'),
    account: z
        .object({
            company: z.object({
                name: z.string(),
                locale: z.string(),
                timezone: z.string(),
                createdAt: z.string().datetime()
            }),
            user: z.object({
                name: z.string(),
                email: z.string(),
                role: z.string(),
                locale: z.string().nullable(),
                termsAcceptedAt: z.string().datetime().nullable(),
                createdAt: z.string().datetime()
            }),
            identities: z.array(
                z.object({
                    provider: z.string(),
                    createdAt: z.string().datetime(),
                    lastLoginAt: z.string().datetime().nullable()
                })
            ),
            sessions: z.array(z.object({ createdAt: z.string().datetime(), ip: z.string().nullable(), userAgent: z.string().nullable() }))
        })
        .describe('Identity data: company, user, sign-in methods and active sessions. Never secrets or provider subjects'),
    sections: z.record(z.string(), z.unknown()).describe('One entry per module that registered an exporter, keyed by area')
});
