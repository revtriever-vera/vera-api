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
const MIN_SECRET_LENGTH: number = 16;

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

function optionalText(): z.ZodType<string | undefined, z.ZodTypeDef, unknown> {
    return z.preprocess(blankAsUndefined, z.string().trim().optional());
}

const schema = z.object({
    IS_LOCAL: isLocalSchema,
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
    FAKE_BILLING_WEBHOOK_SECRET: z.preprocess(blankAsUndefined, z.string().trim().min(MIN_SECRET_LENGTH).optional()),
    BILLING_PRICE_ENDPOINT_URL: optionalText(),
    BILLING_PRICE_CEILING_CENTS: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().optional())
});

export interface BillingSettings {
    readonly IS_LOCAL: boolean;
    /** Fora do local nunca é `fake`. */
    readonly BILLING_ENGINE_DRIVER: BillingEngine;
    /** Falso: as chamadas ao motor respondem 503 `billing.provider_disabled`. */
    readonly BILLING_ENGINE_ENABLED: boolean;
    /** Pediram `fake` fora do local; o pedido foi recusado. */
    readonly BILLING_FAKE_REFUSED: boolean;
    readonly REVTRIEVER_API_URL: string;
    readonly REVTRIEVER_API_KEY: string | null;
    readonly REVTRIEVER_PLAN_ID: string | null;
    readonly REVTRIEVER_GATEWAY_CONNECTION_ID: string | null;
    readonly REVTRIEVER_TIMEOUT_MS: number;
    readonly REVTRIEVER_MAX_RETRIES: number;
    readonly FAKE_BILLING_FORCE_FAILURE: boolean;
    readonly FAKE_BILLING_WEBHOOK_URL: string | null;
    readonly FAKE_BILLING_PUBLIC_URL: string;
    readonly FAKE_BILLING_WEBHOOK_SECRET: string | null;
    readonly BILLING_PRICE_ENDPOINT_URL: string | null;
    readonly BILLING_PRICE_CEILING_CENTS: number | null;
}

type Parsed = z.infer<typeof schema>;

function driverOf(parsed: Parsed): BillingEngine {
    if (parsed.IS_LOCAL) {
        return parsed.BILLING_ENGINE_DRIVER ?? 'fake';
    }
    return 'revtriever';
}

function engineEnabledOf(parsed: Parsed): boolean {
    if (parsed.IS_LOCAL) {
        return parsed.BILLING_ENGINE_DRIVER !== 'revtriever' || parsed.REVTRIEVER_API_KEY !== undefined;
    }
    return (
        parsed.BILLING_ENGINE_DRIVER === 'revtriever' && parsed.REVTRIEVER_API_KEY !== undefined && parsed.REVTRIEVER_PLAN_ID !== undefined
    );
}

function webhookSecretOf(parsed: Parsed): string | null {
    if (parsed.FAKE_BILLING_WEBHOOK_SECRET !== undefined) {
        return parsed.FAKE_BILLING_WEBHOOK_SECRET;
    }
    return parsed.IS_LOCAL ? DEV_WEBHOOK_SECRET : null;
}

export function parseBillingConfig(env: NodeJS.ProcessEnv): BillingSettings {
    const parsed: Parsed = schema.parse(env);
    const driver: BillingEngine = driverOf(parsed);
    return {
        IS_LOCAL: parsed.IS_LOCAL,
        BILLING_ENGINE_DRIVER: driver,
        BILLING_ENGINE_ENABLED: engineEnabledOf(parsed),
        BILLING_FAKE_REFUSED: !parsed.IS_LOCAL && parsed.BILLING_ENGINE_DRIVER === 'fake',
        REVTRIEVER_API_URL: stripTrailing(parsed.REVTRIEVER_API_URL, '/'),
        REVTRIEVER_API_KEY: parsed.REVTRIEVER_API_KEY ?? null,
        REVTRIEVER_PLAN_ID: parsed.REVTRIEVER_PLAN_ID ?? null,
        REVTRIEVER_GATEWAY_CONNECTION_ID: parsed.REVTRIEVER_GATEWAY_CONNECTION_ID ?? null,
        REVTRIEVER_TIMEOUT_MS: parsed.REVTRIEVER_TIMEOUT_MS,
        REVTRIEVER_MAX_RETRIES: parsed.REVTRIEVER_MAX_RETRIES,
        FAKE_BILLING_FORCE_FAILURE: parsed.FAKE_BILLING_FORCE_FAILURE === 'true',
        FAKE_BILLING_WEBHOOK_URL: parsed.FAKE_BILLING_WEBHOOK_URL ?? null,
        FAKE_BILLING_PUBLIC_URL: stripTrailing(parsed.FAKE_BILLING_PUBLIC_URL, '/'),
        FAKE_BILLING_WEBHOOK_SECRET: webhookSecretOf(parsed),
        BILLING_PRICE_ENDPOINT_URL: parsed.BILLING_PRICE_ENDPOINT_URL ?? null,
        BILLING_PRICE_CEILING_CENTS: parsed.BILLING_PRICE_CEILING_CENTS ?? null
    };
}

export const billingConfig = registerAs('billing', (): BillingSettings => parseBillingConfig(process.env));
