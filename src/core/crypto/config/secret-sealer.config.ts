import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { isProductionEnvironment } from '../../../shared/config/environment.schema';
import { SecretSealerDriverName } from '../secret-sealer.port';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const flag = z.preprocess(blankAsUndefined, z.enum(['true', 'false']).default('false'));

const schema = z
    .object({
        SECRET_SEALER_DRIVER: z.preprocess(blankAsUndefined, z.enum(['kms', 'local']).optional()),
        SECRET_SEALER_KMS_KEY_ID: z.preprocess(blankAsUndefined, z.string().trim().min(1).optional()),
        SECRET_SEALER_ALLOW_LOCAL_IN_PROD: flag,
        SECRET_SEALER_ALLOW_LEGACY_LOCAL: flag
    })
    .superRefine((value, context: z.RefinementCtx): void => {
        const driver: SecretSealerDriverName | undefined = value.SECRET_SEALER_DRIVER ?? defaultDriver();
        if (driver === undefined) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'SECRET_SEALER_DRIVER é obrigatório fora do ambiente local' });
            return;
        }
        if (driver === 'kms' && value.SECRET_SEALER_KMS_KEY_ID === undefined) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'SECRET_SEALER_DRIVER=kms exige SECRET_SEALER_KMS_KEY_ID' });
        }
        if (driver === 'local' && isProductionEnvironment() && value.SECRET_SEALER_ALLOW_LOCAL_IN_PROD !== 'true') {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'SECRET_SEALER_DRIVER=local em produção exige SECRET_SEALER_ALLOW_LOCAL_IN_PROD=true'
            });
        }
    })
    .transform((value) => ({
        SECRET_SEALER_DRIVER: value.SECRET_SEALER_DRIVER ?? defaultDriver() ?? 'local',
        SECRET_SEALER_KMS_KEY_ID: value.SECRET_SEALER_KMS_KEY_ID ?? '',
        SECRET_SEALER_ALLOW_LOCAL_IN_PROD: value.SECRET_SEALER_ALLOW_LOCAL_IN_PROD === 'true',
        SECRET_SEALER_ALLOW_LEGACY_LOCAL: value.SECRET_SEALER_ALLOW_LEGACY_LOCAL === 'true'
    }));

function defaultDriver(): SecretSealerDriverName | undefined {
    return process.env['IS_LOCAL'] === 'true' ? 'local' : undefined;
}

export type SecretSealerConfig = z.infer<typeof schema>;

export const secretSealerConfig = registerAs('secretSealer', (): SecretSealerConfig => schema.parse(process.env));
