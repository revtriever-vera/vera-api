import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { stripTrailing } from '../../../shared/utils/strip-trailing';

const DEFAULT_APP_URL: string = 'http://localhost:5173';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const DEFAULT_IP_DAILY_LIMIT: number = 5;

const schema = z.object({
    APP_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_APP_URL)),
    SIGNUP_EMAIL_MARK_HMAC_KEY: z.preprocess(blankAsUndefined, z.string().trim().min(16).optional()),
    SIGNUP_REDEEM_IP_DAILY_LIMIT: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_IP_DAILY_LIMIT))
});

export interface SignupLinksSettings {
    readonly APP_URL: string;
    readonly SIGNUP_EMAIL_MARK_HMAC_KEY: string | null;
    readonly SIGNUP_REDEEM_IP_DAILY_LIMIT: number;
}

export function parseSignupLinksConfig(env: NodeJS.ProcessEnv): SignupLinksSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    return {
        APP_URL: stripTrailing(parsed.APP_URL, '/'),
        SIGNUP_EMAIL_MARK_HMAC_KEY: parsed.SIGNUP_EMAIL_MARK_HMAC_KEY ?? null,
        SIGNUP_REDEEM_IP_DAILY_LIMIT: parsed.SIGNUP_REDEEM_IP_DAILY_LIMIT
    };
}

export const signupLinksConfig = registerAs('signupLinks', (): SignupLinksSettings => parseSignupLinksConfig(process.env));
