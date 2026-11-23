import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { stripTrailing } from '../../../shared/utils/strip-trailing';

const DEFAULT_PUBLIC_API_URL: string = 'http://localhost:3333';
const DEFAULT_APP_URL: string = 'http://localhost:5173';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const schema = z.object({
    PUBLIC_API_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_PUBLIC_API_URL)),
    APP_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_APP_URL))
});

export interface NoticesSettings {
    readonly PUBLIC_API_URL: string;
    readonly APP_URL: string;
}

export function parseNoticesConfig(env: NodeJS.ProcessEnv): NoticesSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    return { PUBLIC_API_URL: stripTrailing(parsed.PUBLIC_API_URL, '/'), APP_URL: stripTrailing(parsed.APP_URL, '/') };
}

export const noticesConfig = registerAs('notices', (): NoticesSettings => parseNoticesConfig(process.env));
