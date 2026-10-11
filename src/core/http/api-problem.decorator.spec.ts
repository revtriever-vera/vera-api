import { describe, expect, it } from 'vitest';
import { ApiProblemResponse } from './api-problem.decorator';

const target: object = {};
const descriptor: PropertyDescriptor = { value: (): void => undefined };

describe('ApiProblemResponse', () => {
    it('applies without throwing and can be reused for multiple statuses', () => {
        expect(() => {
            ApiProblemResponse({ status: 404, description: 'Not found' })(target, 'handler', descriptor);
        }).not.toThrow();
    });

    it('accepts an example payload alongside the schema', () => {
        expect(() => {
            ApiProblemResponse({
                status: 429,
                description: 'Too many attempts',
                example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
            })(target, 'handler', descriptor);
        }).not.toThrow();
    });
});
