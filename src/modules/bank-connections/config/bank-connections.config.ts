import { registerAs } from '@nestjs/config';
import { z } from 'zod';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const DEFAULT_BASE_URL: string = 'https://api.pluggy.ai';
const DEFAULT_TIMEOUT_MS: number = 10_000;
const DEFAULT_AUTH_PATH: string = '/auth';
const DEFAULT_ITEM_PATH: string = '/items';

function apiPath(fallback: string): z.ZodType<string, z.ZodTypeDef, unknown> {
    return z.preprocess(
        blankAsUndefined,
        z
            .string()
            .trim()
            .regex(/^\/[A-Za-z0-9/_-]*$/)
            .default(fallback)
    );
}

const flag = z.preprocess(blankAsUndefined, z.enum(['true', 'false']).default('false'));

const schema = z.object({
    PLUGGY_DRIVER: z.preprocess(blankAsUndefined, z.enum(['live', 'mock']).optional()),
    PLUGGY_BASE_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_BASE_URL)),
    PLUGGY_HTTP_TIMEOUT_MS: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_TIMEOUT_MS)),
    PLUGGY_AUTH_PATH: apiPath(DEFAULT_AUTH_PATH),
    PLUGGY_ITEM_PATH: apiPath(DEFAULT_ITEM_PATH),
    MOCK_PLUGGY_FORCE_401: flag,
    MOCK_PLUGGY_REVOKED_ITEMS: z.preprocess(blankAsUndefined, z.string().trim().optional())
});

export interface BankConnectionsSettings {
    readonly PLUGGY_DRIVER: 'live' | 'mock';
    readonly PLUGGY_BASE_URL: string;
    readonly PLUGGY_HTTP_TIMEOUT_MS: number;
    readonly PLUGGY_AUTH_PATH: string;
    readonly PLUGGY_ITEM_PATH: string;
    readonly PLUGGY_MOCK_ALLOWED: boolean;
    readonly MOCK_PLUGGY_FORCE_401: boolean;
    readonly MOCK_PLUGGY_REVOKED_ITEMS: readonly string[];
}

function revokedItemsOf(raw: string | undefined): string[] {
    return (raw ?? '')
        .split(',')
        .map((entry: string): string => entry.trim().toLowerCase())
        .filter((entry: string): boolean => entry.length > 0);
}

export function parseBankConnectionsConfig(env: NodeJS.ProcessEnv): BankConnectionsSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    const driver: 'live' | 'mock' | undefined = parsed.PLUGGY_DRIVER ?? (env['IS_LOCAL'] === 'true' ? 'mock' : undefined);
    if (driver === undefined) {
        throw new Error('PLUGGY_DRIVER é obrigatório fora do ambiente local');
    }
    return {
        PLUGGY_DRIVER: driver,
        PLUGGY_BASE_URL: parsed.PLUGGY_BASE_URL.replace(/\/+$/, ''),
        PLUGGY_HTTP_TIMEOUT_MS: parsed.PLUGGY_HTTP_TIMEOUT_MS,
        PLUGGY_AUTH_PATH: parsed.PLUGGY_AUTH_PATH,
        PLUGGY_ITEM_PATH: parsed.PLUGGY_ITEM_PATH,
        PLUGGY_MOCK_ALLOWED: env['IS_LOCAL'] === 'true',
        MOCK_PLUGGY_FORCE_401: parsed.MOCK_PLUGGY_FORCE_401 === 'true',
        MOCK_PLUGGY_REVOKED_ITEMS: revokedItemsOf(parsed.MOCK_PLUGGY_REVOKED_ITEMS)
    };
}

export const bankConnectionsConfig = registerAs('bankConnections', (): BankConnectionsSettings => parseBankConnectionsConfig(process.env));
