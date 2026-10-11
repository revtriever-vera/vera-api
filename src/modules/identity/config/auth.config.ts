import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { booleanFlag, devOnlySecret } from '../../../shared/config/environment.schema';

const schema = z
    .object({
        JWT_SECRET: devOnlySecret('dev-secret-do-not-use-in-prod', 32),
        ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(10),
        REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
        COOKIE_SECURE: booleanFlag(false, true),
        GOOGLE_CLIENT_ID: z.string().default(''),
        FACEBOOK_APP_ID: z.string().default(''),
        FACEBOOK_APP_SECRET: z.string().default(''),
        FACEBOOK_GRAPH_VERSION: z
            .string()
            .regex(/^v\d+\.\d+$/)
            .default('v23.0')
    })
    .superRefine((value, context: z.RefinementCtx) => {
        if (value.FACEBOOK_APP_ID !== '' && value.FACEBOOK_APP_SECRET === '') {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['FACEBOOK_APP_SECRET'],
                message: 'FACEBOOK_APP_SECRET é obrigatório quando FACEBOOK_APP_ID está preenchido'
            });
        }
    });

export type AuthConfig = z.infer<typeof schema>;

export const authConfig = registerAs('auth', (): AuthConfig => schema.parse(process.env));
