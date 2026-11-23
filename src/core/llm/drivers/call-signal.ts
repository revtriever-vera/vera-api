export function callSignalOf(timeoutMs: number): AbortSignal {
    return AbortSignal.timeout(timeoutMs);
}
