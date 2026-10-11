import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { booleanFlag, devOnlySecret } from '../../../shared/config/environment.schema';

const schema = z.object({
    JWT_SECRET: devOnlySecret('dev-secret-do-not-use-in-prod', 32),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(10),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
    COOKIE_SECURE: booleanFlag(false, true)
});

export type AuthConfig = z.infer<typeof schema>;

export const authConfig = registerAs('auth', (): AuthConfig => schema.parse(process.env));
