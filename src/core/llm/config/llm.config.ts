import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { deployEnvironmentSchema } from '../../../shared/config/environment.schema';

const DEFAULT_MODEL_ID: string = 'meta/muse-spark-1.3-contributor';
const DEFAULT_TIMEOUT_MS: number = 30_000;
const DEFAULT_MAX_RETRIES: number = 2;
const DEFAULT_REPEAT_LIMIT: number = 3;

const modelPriceSchema = z.object({
    input: z.number().min(0),
    output: z.number().min(0),
    cacheRead: z.number().min(0).default(0)
});

const priceTableSchema = z.record(z.string().min(1), modelPriceSchema);

export type LlmModelPrice = z.infer<typeof modelPriceSchema>;
export type LlmPriceTable = Readonly<Record<string, LlmModelPrice>>;

const priceTableEnvSchema = z
    .string()
    .default('{}')
    .transform((raw: string, context: z.RefinementCtx): LlmPriceTable => {
        try {
            const parsed = priceTableSchema.safeParse(JSON.parse(raw));
            if (parsed.success) {
                return parsed.data;
            }
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'LLM_PRICE_TABLE fora do formato esperado' });
        } catch {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'LLM_PRICE_TABLE não é JSON válido' });
        }
        return z.NEVER;
    });

const schema = z
    .object({
        LLM_DRIVER: z.enum(['live', 'mock']).default('mock'),
        AI_GATEWAY_API_KEY: z.string().default(''),
        LLM_MODEL_ID: z.string().min(1).default(DEFAULT_MODEL_ID),
        LLM_PRICE_TABLE: priceTableEnvSchema,
        LLM_TIMEOUT_MS: z.coerce.number().int().min(1).default(DEFAULT_TIMEOUT_MS),
        LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(DEFAULT_MAX_RETRIES),
        LLM_REPEAT_LIMIT: z.coerce.number().int().min(1).default(DEFAULT_REPEAT_LIMIT),
        DEPLOY_ENV: deployEnvironmentSchema,
        DEPLOYMENT_MODE: z.enum(['hosted', 'self_hosted']).default('hosted')
    })
    .superRefine((value, context: z.RefinementCtx) => {
        const hostedWithKey: boolean = value.DEPLOYMENT_MODE === 'hosted' && value.AI_GATEWAY_API_KEY.length > 0;
        if (hostedWithKey && value.LLM_PRICE_TABLE[value.LLM_MODEL_ID] === undefined) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['LLM_PRICE_TABLE'],
                message: `LLM_PRICE_TABLE não tem preço para o modelo ${value.LLM_MODEL_ID}`
            });
        }
    });

export type LlmConfig = z.infer<typeof schema>;

export const llmConfig = registerAs('llm', (): LlmConfig => schema.parse(process.env));
