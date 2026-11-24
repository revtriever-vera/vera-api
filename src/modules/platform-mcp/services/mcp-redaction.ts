const SENSITIVE_KEY: RegExp = /token|secret|password|authorization|credential|api[-_]?key/i;
const REDACTED: string = '[redacted]';

export function redactArguments(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redactArguments);
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, inner]: [string, unknown]): [string, unknown] => [
            key,
            SENSITIVE_KEY.test(key) ? REDACTED : redactArguments(inner)
        ])
    );
}
