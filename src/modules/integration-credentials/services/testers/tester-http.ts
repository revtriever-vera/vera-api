import { IntegrationTestFailedError } from '../../domain/integration-credentials.errors';
import { TEST_FAILURE_REASONS, TestFailureReason } from '../../domain/integration.types';

const HTTP_UNAUTHORIZED: number = 401;
const HTTP_FORBIDDEN: number = 403;
const HTTP_NOT_FOUND: number = 404;

export function reasonOf(status: number): TestFailureReason {
    if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
        return TEST_FAILURE_REASONS.unauthorized;
    }
    return status === HTTP_NOT_FOUND ? TEST_FAILURE_REASONS.notFound : TEST_FAILURE_REASONS.unreachable;
}

export async function probe(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    try {
        return await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    } catch {
        throw new IntegrationTestFailedError(TEST_FAILURE_REASONS.unreachable);
    }
}

export async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}
