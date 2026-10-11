import { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { SecretSafeValidationError } from '../domain/bank-connections.errors';

export class SecretSafeValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
    public constructor(private readonly schema: z.ZodType<TOutput, z.ZodTypeDef, unknown>) {}

    public transform(value: unknown): TOutput {
        const result: z.SafeParseReturnType<unknown, TOutput> = this.schema.safeParse(value);
        if (result.success) {
            return result.data;
        }
        throw new SecretSafeValidationError(
            result.error.issues.map((issue: z.ZodIssue): { path: string; code: string } => ({
                path: issue.path.join('.'),
                code: issue.code
            }))
        );
    }
}
