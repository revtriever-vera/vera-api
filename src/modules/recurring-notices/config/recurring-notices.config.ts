import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { stripTrailing } from '../../../shared/utils/strip-trailing';

const DEFAULT_APP_URL: string = 'http://localhost:5173';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const schema = z.object({
    APP_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_APP_URL))
});

export interface RecurringNoticesSettings {
    readonly APP_URL: string;
}

export function parseRecurringNoticesConfig(env: NodeJS.ProcessEnv): RecurringNoticesSettings {
    return { APP_URL: stripTrailing(schema.parse(env).APP_URL, '/') };
}

export const recurringNoticesConfig = registerAs('recurringNotices', (): RecurringNoticesSettings =>
    parseRecurringNoticesConfig(process.env)
);
