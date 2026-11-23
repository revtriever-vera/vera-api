import { describe, expect, it } from 'vitest';
import { hasRole } from './role-rank';

describe('hasRole', () => {
    it('segue a hierarquia owner, editor, viewer', () => {
        expect(hasRole('owner', 'owner')).toBe(true);
        expect(hasRole('owner', 'editor')).toBe(true);
        expect(hasRole('editor', 'editor')).toBe(true);
        expect(hasRole('editor', 'viewer')).toBe(true);
        expect(hasRole('viewer', 'viewer')).toBe(true);
        expect(hasRole('editor', 'owner')).toBe(false);
        expect(hasRole('viewer', 'editor')).toBe(false);
    });

    it('recusa um papel que não existe', () => {
        expect(hasRole('member', 'viewer')).toBe(false);
    });
});
