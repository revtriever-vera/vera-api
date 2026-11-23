import { revtrieverProblemSchema } from '../../validation/revtriever-responses.schemas';

export const IDEMPOTENCY_IN_PROGRESS: string = 'engine.idempotency_in_progress';

export async function problemTypeOf(response: Response): Promise<string | null> {
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return null;
    }
    const parsed = revtrieverProblemSchema.safeParse(body);
    return parsed.success ? (parsed.data.type ?? null) : null;
}
