import { JsonObject } from '../../../core/llm/llm.types';
import { AiContext, BuiltContext } from './context/ai-context.types';
import { AskVeraToolOutput } from './ask-vera.types';

export function jsonObjectOf(value: object): JsonObject {
    const parsed: unknown = structuredClone(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('the tool output must be a JSON object');
    }
    return parsed as JsonObject;
}

export function outputOfBuilt(built: BuiltContext<AiContext>): AskVeraToolOutput {
    return { payload: jsonObjectOf(built.payload), numbers: built.numbers, keys: built.keys };
}

export function statusOutput(status: string): AskVeraToolOutput {
    return { payload: { status } };
}

export const MONTH_PATTERN: RegExp = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export function monthIndexOf(month: string): number {
    return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

export function monthOfIndex(index: number): string {
    const year: number = Math.floor(index / 12);
    return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}
