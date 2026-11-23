import { describe, expect, it } from 'vitest';
import { LastOwnerError } from './members.errors';
import { assertKeepsOwner, RoleHolder } from './membership-rules';

const SOLE_OWNER: RoleHolder[] = [
    { id: 'owner-1', role: 'owner' },
    { id: 'editor-1', role: 'editor' }
];

const TWO_OWNERS: RoleHolder[] = [...SOLE_OWNER, { id: 'owner-2', role: 'owner' }];

describe('assertKeepsOwner', () => {
    it('recusa rebaixar, remover ou sair o último Dono', () => {
        expect(() => assertKeepsOwner(SOLE_OWNER, 'owner-1', 'editor')).toThrow(LastOwnerError);
        expect(() => assertKeepsOwner(SOLE_OWNER, 'owner-1', 'viewer')).toThrow(LastOwnerError);
        expect(() => assertKeepsOwner(SOLE_OWNER, 'owner-1', null)).toThrow(LastOwnerError);
    });

    it('aceita as mesmas operações quando há outro Dono', () => {
        expect(() => assertKeepsOwner(TWO_OWNERS, 'owner-1', 'editor')).not.toThrow();
        expect(() => assertKeepsOwner(TWO_OWNERS, 'owner-1', null)).not.toThrow();
    });

    it('aceita mexer em quem não é Dono e manter o Dono como Dono', () => {
        expect(() => assertKeepsOwner(SOLE_OWNER, 'editor-1', null)).not.toThrow();
        expect(() => assertKeepsOwner(SOLE_OWNER, 'editor-1', 'owner')).not.toThrow();
        expect(() => assertKeepsOwner(SOLE_OWNER, 'owner-1', 'owner')).not.toThrow();
    });
});
