import { ZodType } from 'zod';

export function parseJob<T>(schema: ZodType<T>, payload: unknown): T | null {
    const parsed: ReturnType<ZodType<T>['safeParse']> = schema.safeParse(payload);
    return parsed.success ? parsed.data : null;
}
