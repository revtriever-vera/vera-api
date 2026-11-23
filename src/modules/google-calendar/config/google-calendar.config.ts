import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { isLocalSchema } from '../../../shared/config/environment.schema';
import { stripTrailing } from '../../../shared/utils/strip-trailing';

const DEFAULT_PUBLIC_API_URL: string = 'http://localhost:3333';
const DEFAULT_APP_URL: string = 'http://localhost:5173';
const DEFAULT_TIMEOUT_MS: number = 5000;
const HOSTED_CALLBACK_PATH: string = '/api/calendar/google/callback';
const SELF_HOSTED_CALLBACK_PATH: string = '/api/google/callback';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const optionalText = z.preprocess(blankAsUndefined, z.string().trim().optional());

const schema = z.object({
    IS_LOCAL: isLocalSchema,
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    GOOGLE_CALENDAR_REDIRECT_URI: z.preprocess(blankAsUndefined, z.string().trim().url().optional()),
    GOOGLE_CALENDAR_DRIVER: z.preprocess(blankAsUndefined, z.enum(['mock', 'google']).default('mock')),
    GOOGLE_CALENDAR_TIMEOUT_MS: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_TIMEOUT_MS)),
    PUBLIC_API_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_PUBLIC_API_URL)),
    APP_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_APP_URL))
});

export interface GoogleCalendarSettings {
    readonly GOOGLE_CLIENT_ID?: string;
    readonly GOOGLE_CLIENT_SECRET?: string;
    /** Fora do local nunca é `mock`. */
    readonly GOOGLE_CALENDAR_DRIVER: 'mock' | 'google';
    readonly GOOGLE_CALENDAR_TIMEOUT_MS: number;
    readonly APP_URL: string;
    readonly hostedRedirectUri: string;
    readonly selfHostedRedirectUri: string;
}

export function parseGoogleCalendarConfig(env: NodeJS.ProcessEnv): GoogleCalendarSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    const apiUrl: string = stripTrailing(parsed.PUBLIC_API_URL, '/');
    return {
        GOOGLE_CLIENT_ID: parsed.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: parsed.GOOGLE_CLIENT_SECRET,
        GOOGLE_CALENDAR_DRIVER: parsed.IS_LOCAL ? parsed.GOOGLE_CALENDAR_DRIVER : 'google',
        GOOGLE_CALENDAR_TIMEOUT_MS: parsed.GOOGLE_CALENDAR_TIMEOUT_MS,
        APP_URL: stripTrailing(parsed.APP_URL, '/'),
        hostedRedirectUri: parsed.GOOGLE_CALENDAR_REDIRECT_URI ?? `${apiUrl}${HOSTED_CALLBACK_PATH}`,
        selfHostedRedirectUri: `${apiUrl}${SELF_HOSTED_CALLBACK_PATH}`
    };
}

export const googleCalendarConfig = registerAs('googleCalendar', (): GoogleCalendarSettings => parseGoogleCalendarConfig(process.env));
