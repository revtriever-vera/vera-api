import { z } from 'zod';

export const DEPLOY_ENVIRONMENTS = ['local', 'dev', 'prod'] as const;

export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

export const isLocalSchema = z
    .enum(['true', 'false'])
    .default('false')
    .transform((value: string) => value === 'true');

export function booleanFlagSchema(
    defaultValue: boolean
): z.ZodEffects<z.ZodDefault<z.ZodEnum<['true', 'false']>>, boolean, 'true' | 'false' | undefined> {
    return z
        .enum(['true', 'false'])
        .default(defaultValue ? 'true' : 'false')
        .transform((value: string): boolean => value === 'true');
}

export const deployEnvironmentSchema = z.enum(DEPLOY_ENVIRONMENTS).default('dev');

export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
    const declared: string | undefined = env['DEPLOY_ENV'];
    return declared === undefined ? env['NODE_ENV'] === 'production' : declared === 'prod';
}

function runningLocally(): boolean {
    return process.env['IS_LOCAL'] === 'true';
}

export function devOnlySecret(devDefault: string, minLength: number): z.ZodEffects<z.ZodDefault<z.ZodString>> {
    return z
        .string()
        .default(devDefault)
        .superRefine((value: string, context: z.RefinementCtx) => {
            if (runningLocally()) {
                return;
            }
            if (value === devDefault) {
                context.addIssue({ code: z.ZodIssueCode.custom, message: 'segredo com valor de desenvolvimento fora do ambiente local' });
            }
            if (value.length < minLength) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `segredo exige ao menos ${String(minLength)} caracteres fora do ambiente local`
                });
            }
        });
}

export function booleanFlag(
    defaultWhenLocal: boolean,
    defaultWhenDeployed: boolean
): z.ZodEffects<z.ZodOptional<z.ZodEnum<['true', 'false']>>, boolean> {
    return z
        .enum(['true', 'false'])
        .optional()
        .transform((value: 'true' | 'false' | undefined) => {
            if (value !== undefined) {
                return value === 'true';
            }
            return runningLocally() ? defaultWhenLocal : defaultWhenDeployed;
        });
}

export function assertEnvironmentCoherent(isLocal: boolean, deployEnvironment: DeployEnvironment): void {
    if (isLocal && deployEnvironment !== 'local') {
        throw new Error(
            `IS_LOCAL=true com DEPLOY_ENV=${deployEnvironment}: em ambiente deployado isso aceitaria origem de loopback ` +
                'no CORS e relaxaria validações que só valem em desenvolvimento local.'
        );
    }
}
