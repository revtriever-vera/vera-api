import { JsonObject, JsonValue } from './llm.types';

function isObject(candidate: unknown): candidate is Record<string, unknown> {
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

export function unfencedOf(text: string): string {
    const body: string = text.trim();
    if (!body.startsWith('```') || !body.endsWith('```') || body.length < 6) {
        return body;
    }
    const inner: string = body.slice(3, -3).trim();
    return inner.toLowerCase().startsWith('json') ? inner.slice(4).trim() : inner;
}

export function parseJsonObject(text: string): unknown {
    const body: string = unfencedOf(text);
    const start: number = body.indexOf('{');
    const end: number = body.lastIndexOf('}');
    if (start < 0 || end <= start) {
        return null;
    }
    try {
        return JSON.parse(body.slice(start, end + 1)) as unknown;
    } catch {
        return null;
    }
}

function requiredKeysOf(schema: Record<string, unknown>): readonly string[] {
    return Array.isArray(schema['required']) ? schema['required'].filter((key: unknown): key is string => typeof key === 'string') : [];
}

function propertiesOf(schema: Record<string, unknown>): Record<string, unknown> {
    const properties: unknown = schema['properties'];
    return isObject(properties) ? properties : {};
}

function conformArray(value: readonly unknown[], schema: Record<string, unknown>): unknown[] {
    const max: unknown = schema['maxItems'];
    const kept: readonly unknown[] = typeof max === 'number' && value.length > max ? value.slice(0, max) : value;
    return kept.map((item: unknown): unknown => conformToSchema(item, schema['items']));
}

function conformString(value: string, schema: Record<string, unknown>): string {
    const max: unknown = schema['maxLength'];
    return typeof max === 'number' && value.length > max ? value.slice(0, max).trimEnd() : value;
}

function emptyValueOf(schema: unknown): unknown {
    if (!isObject(schema)) {
        return undefined;
    }
    if (schema['nullable'] === true) {
        return null;
    }
    const min: unknown = schema['minItems'];
    return schema['type'] === 'array' && (typeof min !== 'number' || min === 0) ? [] : undefined;
}

function withOmittedEmpties(value: Record<string, unknown>, schema: Record<string, unknown>): Record<string, unknown> {
    const properties: Record<string, unknown> = propertiesOf(schema);
    const omitted: [string, unknown][] = requiredKeysOf(schema)
        .filter((key: string): boolean => !(key in value))
        .map((key: string): [string, unknown] => [key, emptyValueOf(properties[key])])
        .filter(([, empty]: [string, unknown]): boolean => empty !== undefined);
    return omitted.length === 0 ? value : { ...value, ...Object.fromEntries(omitted) };
}

function conformObject(value: Record<string, unknown>, schema: Record<string, unknown>): Record<string, unknown> {
    const properties: Record<string, unknown> = propertiesOf(schema);
    if (Object.keys(properties).length === 0) {
        return value;
    }
    return Object.fromEntries(
        Object.entries(withOmittedEmpties(value, schema)).map(([key, item]: [string, unknown]): [string, unknown] => [
            key,
            conformToSchema(item, properties[key])
        ])
    );
}

function structuredOf(value: unknown, schema: Record<string, unknown>): unknown {
    if (typeof value !== 'string' || (schema['type'] !== 'object' && schema['type'] !== 'array')) {
        return value;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null ? parsed : value;
    } catch {
        return value;
    }
}

export function conformToSchema(value: unknown, schema: unknown): unknown {
    if (!isObject(schema)) {
        return value;
    }
    const current: unknown = structuredOf(value, schema);
    if (Array.isArray(current)) {
        return conformArray(current, schema);
    }
    if (isObject(current)) {
        return conformObject(current, schema);
    }
    return typeof current === 'string' ? conformString(current, schema) : current;
}

const NULL_TYPE: string = 'null';

interface DeclaredType {
    readonly type: string | undefined;
    readonly nullable: boolean;
}

function declaredTypeOf(schema: Record<string, unknown>): DeclaredType {
    const type: unknown = schema['type'];
    if (!Array.isArray(type)) {
        return { type: typeof type === 'string' ? type : undefined, nullable: schema['nullable'] === true };
    }
    const types: readonly string[] = type.filter((entry: unknown): entry is string => typeof entry === 'string');
    const [single, ...others]: readonly string[] = types.filter((entry: string): boolean => entry !== NULL_TYPE);
    return { type: others.length === 0 ? single : undefined, nullable: schema['nullable'] === true || types.includes(NULL_TYPE) };
}

function nullableOf(schema: JsonObject): JsonObject {
    const type: JsonValue | undefined = schema['type'];
    if (typeof type !== 'string' || type === 'object' || type === 'array') {
        return { anyOf: [schema, { type: NULL_TYPE }] };
    }
    const values: JsonValue | undefined = schema['enum'];
    return { ...schema, type: [type, NULL_TYPE], ...(Array.isArray(values) ? { enum: [...values, null] } : {}) };
}

function strictObjectOf(properties: Record<string, unknown>, required: ReadonlySet<string>): JsonObject {
    return {
        properties: Object.fromEntries(
            Object.entries(properties).map(([name, property]: [string, unknown]): [string, JsonValue] => [
                name,
                strictSchemaOf(property, !required.has(name))
            ])
        ),
        required: Object.keys(properties),
        additionalProperties: false
    };
}

function strictSchemaOf(schema: unknown, optional: boolean): JsonObject {
    if (!isObject(schema)) {
        return {};
    }
    const declared: DeclaredType = declaredTypeOf(schema);
    const strict: JsonObject = {
        ...(declared.type === undefined ? {} : { type: declared.type }),
        ...(typeof schema['description'] === 'string' ? { description: schema['description'] } : {}),
        ...(Array.isArray(schema['enum']) ? { enum: schema['enum'] as JsonValue[] } : {}),
        ...(schema['items'] === undefined ? {} : { items: strictSchemaOf(schema['items'], false) }),
        ...(declared.type === 'object' ? strictObjectOf(propertiesOf(schema), new Set(requiredKeysOf(schema))) : {})
    };
    return optional || declared.nullable ? nullableOf(strict) : strict;
}

export function strictWireSchemaOf(schema: unknown): JsonObject {
    return strictSchemaOf(schema, false);
}
