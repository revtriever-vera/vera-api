export const DEFAULT_BULL_PREFIX: string = '{vera}';

const HASH_TAG: RegExp = /\{[^{}]+\}/;

export function bullPrefixFromEnvironment(environment: NodeJS.ProcessEnv = process.env): string {
    const raw: string = (environment['BULL_PREFIX'] ?? '').trim();
    if (raw.length === 0) {
        return DEFAULT_BULL_PREFIX;
    }
    if (!HASH_TAG.test(raw)) {
        throw new Error(
            `BULL_PREFIX must contain a hash tag such as ${DEFAULT_BULL_PREFIX} so every key of a queue lands in one cluster slot`
        );
    }
    return raw;
}
