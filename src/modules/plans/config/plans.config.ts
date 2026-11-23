import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { isLocalSchema } from '../../../shared/config/environment.schema';
import { DeploymentMode } from '../domain/plans.types';

const schema = z
    .object({
        IS_LOCAL: isLocalSchema,
        DEPLOYMENT_MODE: z.enum(['hosted', 'self_hosted']).optional(),
        PAID_USAGE_CAP_MICROS: z.coerce.number().int().min(0).default(0)
    })
    .superRefine((value, context: z.RefinementCtx) => {
        if (!value.IS_LOCAL && value.DEPLOYMENT_MODE === undefined) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['DEPLOYMENT_MODE'],
                message: 'DEPLOYMENT_MODE é obrigatório fora do ambiente local'
            });
        }
    })
    .transform((value): PlansConfig => ({
        DEPLOYMENT_MODE: value.DEPLOYMENT_MODE ?? 'hosted',
        PAID_USAGE_CAP_MICROS: value.PAID_USAGE_CAP_MICROS
    }));

export interface PlansConfig {
    readonly DEPLOYMENT_MODE: DeploymentMode;
    readonly PAID_USAGE_CAP_MICROS: number;
}

export const plansConfig = registerAs('plans', (): PlansConfig => schema.parse(process.env));
