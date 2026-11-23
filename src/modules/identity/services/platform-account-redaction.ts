const SECRET_KEY: RegExp = /hint|token|secret|credential|password|api.?key|cipher|encrypted|^card|card(brand|last|number|holder)/i;

export function redactSecrets(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item: unknown): unknown => redactSecrets(item));
    }
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([key]: [string, unknown]): boolean => !SECRET_KEY.test(key))
                .map(([key, inner]: [string, unknown]): [string, unknown] => [key, redactSecrets(inner)])
        );
    }
    return value;
}
