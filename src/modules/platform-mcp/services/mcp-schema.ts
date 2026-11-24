import { zodToOpenAPI } from 'nestjs-zod';
import { ZodTypeAny } from 'zod';

type JsonSchema = Record<string, unknown>;

function isSchema(value: unknown): value is JsonSchema {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalized(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalized);
    }
    if (!isSchema(value)) {
        return value;
    }
    const { nullable, ...rest } = value;
    const converted: JsonSchema = Object.fromEntries(
        Object.entries(rest).map(([key, inner]: [string, unknown]) => [key, normalized(inner)])
    );
    if (nullable === true && typeof converted['type'] === 'string') {
        return { ...converted, type: [converted['type'], 'null'] };
    }
    return converted;
}

export function inputSchemaOf(schema: ZodTypeAny): JsonSchema {
    const converted: unknown = normalized(zodToOpenAPI(schema));
    return isSchema(converted) ? { ...converted, type: 'object' } : { type: 'object' };
}
