import { describe, expect, it } from 'vitest';
import { isUniqueViolationError, MissingTenantContextError } from './database.errors';

describe('MissingTenantContextError', () => {
    it('carries the table name in meta', () => {
        const error: MissingTenantContextError = new MissingTenantContextError('Users');

        expect(error.code).toBe('core.missing_tenant_context');
        expect(error.meta).toEqual({ table: 'Users' });
    });
});

describe('isUniqueViolationError', () => {
    it('recognizes a Postgres 23505 error', () => {
        expect(isUniqueViolationError({ code: '23505' })).toBe(true);
    });

    it('rejects any other error code', () => {
        expect(isUniqueViolationError({ code: '23503' })).toBe(false);
    });

    it('rejects non-error values', () => {
        expect(isUniqueViolationError(null)).toBe(false);
        expect(isUniqueViolationError('boom')).toBe(false);
        expect(isUniqueViolationError(undefined)).toBe(false);
    });

    it('matches a specific constraint when one is given', () => {
        expect(isUniqueViolationError({ code: '23505', constraint: 'Users_email_unique' }, 'Users_email_unique')).toBe(true);
        expect(isUniqueViolationError({ code: '23505', constraint: 'Sessions_tokenHash_key' }, 'Users_email_unique')).toBe(false);
    });
});
