import { describe, expect, it, vi } from 'vitest';
import { InvalidHolderError } from '../domain/members.errors';
import { UserDomain } from '../domain/user.domain';
import { MemberDirectoryService } from './member-directory.service';

function service(users: Record<string, ReturnType<typeof vi.fn>>): MemberDirectoryService {
    return new MemberDirectoryService(users as unknown as UserDomain);
}

describe('MemberDirectoryService', () => {
    it('lists the active people with id and name only', async () => {
        const listMembers = vi.fn().mockResolvedValue([{ id: 'ana', name: 'Ana', email: 'x@example.com', role: 'owner' }]);

        expect(await service({ listMembers }).list()).toEqual([{ userId: 'ana', name: 'Ana' }]);
    });

    it('returns the active person asked for', async () => {
        const findById = vi.fn().mockResolvedValue({ id: 'ana', name: 'Ana' });

        expect(await service({ findById }).requireActive('ana')).toEqual({ userId: 'ana', name: 'Ana' });
    });

    it('refuses a person who is not an active member of the account', async () => {
        const findById = vi.fn().mockResolvedValue(null);

        await expect(service({ findById }).requireActive('outsider')).rejects.toBeInstanceOf(InvalidHolderError);
        await expect(service({ findById }).requireActive('outsider')).rejects.toMatchObject({
            code: 'members.invalid_holder',
            status: 422
        });
    });
});
