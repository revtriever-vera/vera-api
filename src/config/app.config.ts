import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import {
    assertEnvironmentCoherent,
    booleanFlag,
    deployEnvironmentSchema,
    devOnlySecret,
    isLocalSchema
} from '../shared/config/environment.schema';

const schema = z
    .object({
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        IS_LOCAL: isLocalSchema,
        DEPLOY_ENV: deployEnvironmentSchema,
        PORT: z.coerce.number().default(3333),
        LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
        DOCS_ENABLED: booleanFlag(true, false),
        QUEUES_DASHBOARD_ENABLED: booleanFlag(true, false),
        SWAGGER_USER: z.string().default('admin'),
        SWAGGER_PASSWORD: devOnlySecret('123456', 16),
        QUEUES_DASHBOARD_USER: z.string().default('admin'),
        QUEUES_DASHBOARD_PASSWORD: devOnlySecret('123456', 16),
        CORS_ORIGINS: z
            .string()
            .default('')
            .transform((raw: string) =>
                raw
                    .split(',')
                    .map((entry: string) => entry.trim().toLowerCase())
                    .filter((entry: string) => entry.length > 0)
            )
    })
    .superRefine((value, context) => {
        try {
            assertEnvironmentCoherent(value.IS_LOCAL, value.DEPLOY_ENV);
        } catch (error: unknown) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['IS_LOCAL'],
                message: error instanceof Error ? error.message : String(error)
            });
        }
    });

export type AppConfig = z.infer<typeof schema>;

export const appConfig = registerAs('app', (): AppConfig => schema.parse(process.env));
