import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const DEFAULT_MAX_ACTIVE: number = 20;
const DEFAULT_MAX_TEMPLATE_SENDS_MONTH: number = 30;

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const schema = z.object({
    REMINDERS_MAX_ACTIVE: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_MAX_ACTIVE)),
    REMINDERS_MAX_TEMPLATE_SENDS_MONTH: z.preprocess(
        blankAsUndefined,
        z.coerce.number().int().min(0).default(DEFAULT_MAX_TEMPLATE_SENDS_MONTH)
    )
});

export interface RemindersSettings {
    readonly REMINDERS_MAX_ACTIVE: number;
    readonly REMINDERS_MAX_TEMPLATE_SENDS_MONTH: number;
}

export function parseRemindersConfig(env: NodeJS.ProcessEnv): RemindersSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    return {
        REMINDERS_MAX_ACTIVE: parsed.REMINDERS_MAX_ACTIVE,
        REMINDERS_MAX_TEMPLATE_SENDS_MONTH: parsed.REMINDERS_MAX_TEMPLATE_SENDS_MONTH
    };
}

export const remindersConfig = registerAs('reminders', (): RemindersSettings => parseRemindersConfig(process.env));
