import { createHash } from 'node:crypto';
import { JsonObject, JsonValue } from '../../../core/llm/llm.types';

function byCodeUnit(left: string, right: string): number {
    return left < right ? -1 : Number(left > right);
}

function entryOf(object: { [key: string]: JsonValue }, key: string): string {
    return JSON.stringify(key) + ':' + canonical(object[key] as JsonValue);
}

function canonical(value: JsonValue): string {
    if (Array.isArray(value)) {
        return '[' + value.map(canonical).join(',') + ']';
    }
    if (value !== null && typeof value === 'object') {
        return (
            '{' +
            Object.keys(value)
                .sort(byCodeUnit)
                .map((key: string): string => entryOf(value, key))
                .join(',') +
            '}'
        );
    }
    return JSON.stringify(value);
}

function digest(text: string): string {
    return createHash('sha256').update(text).digest('hex');
}

export function actionHashOf(tool: string, payload: JsonObject): string {
    return digest(`${tool}\n${canonical(payload)}`);
}

export function stateHashOf(state: string): string {
    return digest(state);
}
