import { describe, expect, it } from 'vitest';
import { problemSchema } from './problem.schema';

describe('problemSchema', () => {
    it('accepts a well-formed problem+json body', () => {
        const result = problemSchema.safeParse({
            type: 'stores.connection_not_found',
            title: 'ConnectionNotFoundError',
            status: 404,
            detail: 'Connection does not exist.',
            requestId: 'req-1',
            meta: { connectionId: 'abc' }
        });

        expect(result.success).toBe(true);
    });

    it('accepts a body without requestId set (null) and without meta', () => {
        const result = problemSchema.safeParse({
            type: 'internal_error',
            title: 'InternalServerError',
            status: 500,
            detail: 'Unexpected error.',
            requestId: null
        });

        expect(result.success).toBe(true);
    });

    it('rejects a body missing required fields', () => {
        const result = problemSchema.safeParse({ type: 'internal_error' });

        expect(result.success).toBe(false);
    });
});
