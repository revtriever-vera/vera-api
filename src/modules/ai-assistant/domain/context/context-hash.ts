import { compareCodeUnits } from '../../../../shared/utils/compare-code-units';
import { HashUtil } from '../../../../shared/utils/hash.util';
import { AI_NOTICE_VERSION } from '../ai-notice';
import { AiContext } from './ai-context.types';

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left]: [string, unknown], [right]: [string, unknown]): number => compareCodeUnits(left, right))
                .map(([key, inner]: [string, unknown]): [string, unknown] => [key, canonicalize(inner)])
        );
    }
    return value;
}

export function canonicalJson(context: AiContext): string {
    return JSON.stringify(canonicalize(context));
}

export function serializeContext(context: AiContext): string {
    return JSON.stringify(context);
}

export function contextHash(context: AiContext, locale: string, promptVersion: string): string {
    return HashUtil.sha256([canonicalJson(context), locale, String(AI_NOTICE_VERSION), promptVersion].join('\n'));
}
