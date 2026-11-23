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

export interface GoalNoticesSettings {
    readonly APP_URL: string;
}

export function parseGoalNoticesConfig(env: NodeJS.ProcessEnv): GoalNoticesSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    return { APP_URL: stripTrailing(parsed.APP_URL, '/') };
}

export const goalNoticesConfig = registerAs('goalNotices', (): GoalNoticesSettings => parseGoalNoticesConfig(process.env));
