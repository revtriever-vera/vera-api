import { CatalogSourceError } from '../domain/catalog.errors';
import { SOURCE_ERROR_CODES } from '../domain/catalog.types';

const HTTP_TOO_MANY_REQUESTS: number = 429;
const HTTP_SERVER_ERROR: number = 500;

export function sourceErrorOfStatus(status: number): CatalogSourceError {
    if (status === HTTP_TOO_MANY_REQUESTS) {
        return new CatalogSourceError(SOURCE_ERROR_CODES.rateLimited);
    }
    return new CatalogSourceError(status >= HTTP_SERVER_ERROR ? SOURCE_ERROR_CODES.unavailable : SOURCE_ERROR_CODES.rejected);
}

export async function fetchSource(url: string, headers: Readonly<Record<string, string>>, timeoutMs: number): Promise<Response> {
    try {
        return await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.unreachable);
    }
}

export async function fetchSourceOk(url: string, headers: Readonly<Record<string, string>>, timeoutMs: number): Promise<Response> {
    const response: Response = await fetchSource(url, headers, timeoutMs);
    if (!response.ok) {
        throw sourceErrorOfStatus(response.status);
    }
    return response;
}

export async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
    }
}
