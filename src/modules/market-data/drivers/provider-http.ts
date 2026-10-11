import { ProviderError } from '../domain/market-data.errors';

export async function requestJson(url: string, headers: Readonly<Record<string, string>>, timeoutMs: number): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
        throw ProviderError.unreachable();
    }
    if (!response.ok) {
        throw ProviderError.ofStatus(response.status);
    }
    try {
        return await response.json();
    } catch {
        throw ProviderError.formatInvalid();
    }
}
