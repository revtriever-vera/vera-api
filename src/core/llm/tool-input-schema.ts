import { zodToOpenAPI } from 'nestjs-zod';
import { z } from 'zod';
import { JsonObject, JsonValue } from './llm.types';

const OPENAPI_ONLY_BOOLEANS: ReadonlySet<string> = new Set(['exclusiveMinimum', 'exclusiveMaximum']);
const OPENAPI_NULLABLE: string = 'nullable';
const NULL_TYPE: string = 'null';

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withNullInType(schema: JsonObject): JsonObject {
    const rest: JsonObject = Object.fromEntries(
        Object.entries(schema).filter(([key]: [string, JsonValue]): boolean => key !== OPENAPI_NULLABLE)
    );
    if (schema[OPENAPI_NULLABLE] !== true) {
        return rest;
    }
    const type: JsonValue | undefined = rest['type'];
    if (typeof type !== 'string') {
        return { anyOf: [rest, { type: NULL_TYPE }] };
    }
    const values: JsonValue | undefined = rest['enum'];
    return { ...rest, type: [type, NULL_TYPE], ...(Array.isArray(values) ? { enum: [...values, null] } : {}) };
}

function draft2020Of(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        return value.map(draft2020Of);
    }
    if (typeof value !== 'object' || value === null) {
        return value;
    }
    return withNullInType(
        Object.fromEntries(
            Object.entries(value)
                .filter(
                    ([key, entry]: [string, JsonValue]): boolean =>
                        !key.startsWith('x-') && !(OPENAPI_ONLY_BOOLEANS.has(key) && typeof entry === 'boolean')
                )
                .map(([key, entry]: [string, JsonValue]): [string, JsonValue] => [key, draft2020Of(entry)])
        )
    );
}

function wrappedOf(schema: z.ZodTypeAny): z.ZodTypeAny | null {
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
        return schema._def.innerType as z.ZodTypeAny;
    }
    return schema instanceof z.ZodEffects ? (schema._def.schema as z.ZodTypeAny) : null;
}

function withOmittableProperties(shape: Record<string, z.ZodTypeAny>, properties: JsonValue | undefined): JsonValue | undefined {
    if (!isJsonObject(properties)) {
        return properties;
    }
    return Object.fromEntries(
        Object.entries(properties).map(([name, property]: [string, JsonValue]): [string, JsonValue] => {
            const inner: z.ZodTypeAny | undefined = shape[name];
            return [name, inner === undefined ? property : withOmittableFields(inner, property)];
        })
    );
}

function objectWithOmittableFields(schema: z.AnyZodObject, json: JsonObject): JsonObject {
    const shape: Record<string, z.ZodTypeAny> = schema.shape as Record<string, z.ZodTypeAny>;
    const required: string[] = Object.keys(shape).filter((key: string): boolean => shape[key]?.isOptional() !== true);
    const properties: JsonValue | undefined = withOmittableProperties(shape, json['properties']);
    const rest: JsonObject = Object.fromEntries(Object.entries(json).filter(([key]: [string, JsonValue]): boolean => key !== 'required'));
    return {
        ...rest,
        ...(properties === undefined ? {} : { properties }),
        ...(required.length > 0 ? { required } : {})
    };
}

function withOmittableAt(json: JsonObject, key: string, schema: z.ZodTypeAny): JsonObject {
    const entry: JsonValue | undefined = json[key];
    return entry === undefined ? json : { ...json, [key]: withOmittableFields(schema, entry) };
}

function withOmittableFields(schema: z.ZodTypeAny, json: JsonValue): JsonValue {
    if (!isJsonObject(json)) {
        return json;
    }
    if (schema instanceof z.ZodObject) {
        return objectWithOmittableFields(schema as z.AnyZodObject, json);
    }
    const wrapped: z.ZodTypeAny | null = wrappedOf(schema);
    if (wrapped !== null) {
        return withOmittableFields(wrapped, json);
    }
    if (schema instanceof z.ZodArray) {
        return withOmittableAt(json, 'items', schema._def.type as z.ZodTypeAny);
    }
    return json;
}

export function toolInputSchemaOf(schema: z.ZodTypeAny): JsonObject {
    const openApi: JsonObject = zodToOpenAPI(schema) as JsonObject;
    return draft2020Of(withOmittableFields(schema, openApi)) as JsonObject;
}
