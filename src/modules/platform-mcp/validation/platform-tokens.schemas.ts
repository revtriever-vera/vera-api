import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PLATFORM_TOKEN_DEFAULT_DAYS, PLATFORM_TOKEN_MAX_DAYS } from '../../identity/services/platform-token.limits';

const MAX_NAME: number = 80;

export const createPlatformTokenSchema = z.object({
    name: z.string().trim().min(1).max(MAX_NAME).describe('What the token is for, for example the machine or the person using it'),
    expiresInDays: z
        .number()
        .int()
        .min(1)
        .max(PLATFORM_TOKEN_MAX_DAYS)
        .default(PLATFORM_TOKEN_DEFAULT_DAYS)
        .describe(
            `Days until the token stops working (1 to ${String(PLATFORM_TOKEN_MAX_DAYS)}, ${String(PLATFORM_TOKEN_DEFAULT_DAYS)} by default)`
        )
});

export class CreatePlatformTokenDto extends createZodDto(createPlatformTokenSchema) {}

export const platformTokenIdParamsSchema = z.object({
    id: z.string().uuid().describe('Platform token id')
});

export class PlatformTokenIdParamsDto extends createZodDto(platformTokenIdParamsSchema) {}

export const platformTokenSchema = z.object({
    id: z.string().uuid().describe('Token id'),
    name: z.string().describe('What the token is for'),
    hint: z.string().describe('Last characters of the token, to tell tokens apart; the token itself is never shown again'),
    createdByUserId: z.string().uuid().describe('Platform user who created the token'),
    expiresAt: z.string().datetime().describe('When the token stops working'),
    lastUsedAt: z.string().datetime().nullable().describe('Last call made with the token; null when never used'),
    revokedAt: z.string().datetime().nullable().describe('When the token was revoked; null while it is valid'),
    createdAt: z.string().datetime().describe('When the token was created')
});

export type PlatformTokenView = z.infer<typeof platformTokenSchema>;

export const createdPlatformTokenSchema = platformTokenSchema.extend({
    token: z.string().describe('The token, `vera_pat_...`. Shown only in this response; only its hash is kept')
});

export type CreatedPlatformTokenView = z.infer<typeof createdPlatformTokenSchema>;

export const platformTokenListSchema = z.object({
    items: z.array(platformTokenSchema).describe('Newest first')
});

export type PlatformTokenListView = z.infer<typeof platformTokenListSchema>;
