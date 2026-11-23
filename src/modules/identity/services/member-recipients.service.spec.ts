import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyDomain } from '../domain/company.domain';
import { UserDomain } from '../domain/user.domain';
import { MemberRecipientsService } from './member-recipients.service';

const MEMBERS: object[] = [
    { id: 'a', name: 'Ana Souza', email: 'ana@example.com', role: 'owner', locale: null },
    { id: 'b', name: 'Bob Lee', email: 'bob@example.com', role: 'viewer', locale: 'en' }
];

function service(companyId: string | undefined, company: { locale: string } | null): MemberRecipientsService {
    return new MemberRecipientsService(
        {
            listMembers: vi.fn().mockResolvedValue(MEMBERS),
            findById: vi
                .fn()
                .mockImplementation((id: string) => Promise.resolve(MEMBERS.find((member) => (member as { id: string }).id === id) ?? null))
        } as unknown as UserDomain,
        { findById: vi.fn().mockResolvedValue(company) } as unknown as CompanyDomain,
        { get: vi.fn().mockReturnValue({ requestId: 'req', companyId }) } as unknown as AppContext
    );
}

describe('MemberRecipientsService', () => {
    it('lists everyone in the account, of any role, with the first name and the locale of the person or the company', async () => {
        expect(await service('company-1', { locale: 'pt-BR' }).list()).toEqual([
            { userId: 'a', email: 'ana@example.com', firstName: 'Ana', locale: 'pt-BR' },
            { userId: 'b', email: 'bob@example.com', firstName: 'Bob', locale: 'en' }
        ]);
    });

    it('finds one person of the account and answers null for who is not in it', async () => {
        expect(await service('company-1', { locale: 'pt-BR' }).find('b')).toEqual({
            userId: 'b',
            email: 'bob@example.com',
            firstName: 'Bob',
            locale: 'en'
        });
        expect(await service('company-1', { locale: 'pt-BR' }).find('ghost')).toBeNull();
    });

    it('returns nobody without a company in context or when the company is gone', async () => {
        expect(await service(undefined, null).list()).toEqual([]);
        expect(await service('company-1', null).list()).toEqual([]);
        expect(await service('company-1', null).find('a')).toBeNull();
    });
});
