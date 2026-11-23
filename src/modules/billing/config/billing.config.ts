import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { isLocalSchema } from '../../../shared/config/environment.schema';
import { stripTrailing } from '../../../shared/utils/strip-trailing';
import { BILLING_ENGINES, BillingEngine } from '../domain/billing-engine.types';

const DEFAULT_TIMEOUT_MS: number = 10_000;
const DEFAULT_MAX_RETRIES: number = 2;
const MAX_RETRIES_CEILING: number = 5;
const DEFAULT_API_URL: string = 'https://api.revtriever.com';
const DEFAULT_PUBLIC_URL: string = 'http://localhost:3333';
const DEV_WEBHOOK_SECRET: string = 'vera-dev-billing-webhook-secret';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

function optionalText(): z.ZodType<string | undefined, z.ZodTypeDef, unknown> {
    return z.preprocess(blankAsUndefined, z.string().trim().optional());
}

const schema = z.object({
    IS_LOCAL: isLocalSchema,
    DEPLOYMENT_MODE: z.preprocess(blankAsUndefined, z.enum(['hosted', 'self_hosted']).optional()),
    BILLING_ENGINE_DRIVER: z.preprocess(blankAsUndefined, z.enum(BILLING_ENGINES).optional()),
    REVTRIEVER_API_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_API_URL)),
    REVTRIEVER_API_KEY: optionalText(),
    REVTRIEVER_PLAN_ID: optionalText(),
    REVTRIEVER_GATEWAY_CONNECTION_ID: optionalText(),
    REVTRIEVER_TIMEOUT_MS: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_TIMEOUT_MS)),
    REVTRIEVER_MAX_RETRIES: z.preprocess(
        blankAsUndefined,
        z.coerce.number().int().min(0).max(MAX_RETRIES_CEILING).default(DEFAULT_MAX_RETRIES)
    ),
    FAKE_BILLING_FORCE_FAILURE: z.preprocess(blankAsUndefined, z.enum(['true', 'false']).default('false')),
    FAKE_BILLING_WEBHOOK_URL: optionalText(),
    FAKE_BILLING_PUBLIC_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_PUBLIC_URL)),
    FAKE_BILLING_WEBHOOK_SECRET: z.preprocess(blankAsUndefined, z.string().trim().min(16).default(DEV_WEBHOOK_SECRET)),
    BILLING_PRICE_ENDPOINT_URL: optionalText(),
    BILLING_PRICE_CEILING_CENTS: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().optional())
});

export interface BillingSettings {
    readonly IS_LOCAL: boolean;
    readonly BILLING_ENGINE_DRIVER: BillingEngine;
    readonly REVTRIEVER_API_URL: string;
    readonly REVTRIEVER_API_KEY: string | null;
    readonly REVTRIEVER_PLAN_ID: string | null;
    readonly REVTRIEVER_GATEWAY_CONNECTION_ID: string | null;
    readonly REVTRIEVER_TIMEOUT_MS: number;
    readonly REVTRIEVER_MAX_RETRIES: number;
    readonly FAKE_BILLING_FORCE_FAILURE: boolean;
    readonly FAKE_BILLING_WEBHOOK_URL: string | null;
    readonly FAKE_BILLING_PUBLIC_URL: string;
    readonly FAKE_BILLING_WEBHOOK_SECRET: string;
    readonly BILLING_PRICE_ENDPOINT_URL: string | null;
    readonly BILLING_PRICE_CEILING_CENTS: number | null;
}

type Parsed = z.infer<typeof schema>;

function driverOf(parsed: Parsed): BillingEngine {
    if (parsed.BILLING_ENGINE_DRIVER !== undefined) {
        return parsed.BILLING_ENGINE_DRIVER;
    }
    const hostedOutsideLocal: boolean = !parsed.IS_LOCAL && (parsed.DEPLOYMENT_MODE ?? 'hosted') === 'hosted';
    if (hostedOutsideLocal) {
        throw new Error('BILLING_ENGINE_DRIVER é obrigatório fora do ambiente local em hosted');
    }
    return 'fake';
}

function assertRevtrieverConfigured(parsed: Parsed): void {
    const missing: string[] = [];
    if (parsed.REVTRIEVER_API_KEY === undefined) {
        missing.push('REVTRIEVER_API_KEY');
    }
    if (parsed.REVTRIEVER_PLAN_ID === undefined) {
        missing.push('REVTRIEVER_PLAN_ID');
    }
    if (missing.length > 0 && !parsed.IS_LOCAL) {
        throw new Error(`${missing.join(' e ')} é obrigatório com BILLING_ENGINE_DRIVER=revtriever`);
    }
}

export function parseBillingConfig(env: NodeJS.ProcessEnv): BillingSettings {
    const parsed: Parsed = schema.parse(env);
    const driver: BillingEngine = driverOf(parsed);
    if (driver === 'revtriever') {
        assertRevtrieverConfigured(parsed);
    }
    return {
        IS_LOCAL: parsed.IS_LOCAL,
        BILLING_ENGINE_DRIVER: driver,
        REVTRIEVER_API_URL: stripTrailing(parsed.REVTRIEVER_API_URL, '/'),
        REVTRIEVER_API_KEY: parsed.REVTRIEVER_API_KEY ?? null,
        REVTRIEVER_PLAN_ID: parsed.REVTRIEVER_PLAN_ID ?? null,
        REVTRIEVER_GATEWAY_CONNECTION_ID: parsed.REVTRIEVER_GATEWAY_CONNECTION_ID ?? null,
        REVTRIEVER_TIMEOUT_MS: parsed.REVTRIEVER_TIMEOUT_MS,
        REVTRIEVER_MAX_RETRIES: parsed.REVTRIEVER_MAX_RETRIES,
        FAKE_BILLING_FORCE_FAILURE: parsed.FAKE_BILLING_FORCE_FAILURE === 'true',
        FAKE_BILLING_WEBHOOK_URL: parsed.FAKE_BILLING_WEBHOOK_URL ?? null,
        FAKE_BILLING_PUBLIC_URL: stripTrailing(parsed.FAKE_BILLING_PUBLIC_URL, '/'),
        FAKE_BILLING_WEBHOOK_SECRET: parsed.FAKE_BILLING_WEBHOOK_SECRET,
        BILLING_PRICE_ENDPOINT_URL: parsed.BILLING_PRICE_ENDPOINT_URL ?? null,
        BILLING_PRICE_CEILING_CENTS: parsed.BILLING_PRICE_CEILING_CENTS ?? null
    };
}

export const billingConfig = registerAs('billing', (): BillingSettings => parseBillingConfig(process.env));
