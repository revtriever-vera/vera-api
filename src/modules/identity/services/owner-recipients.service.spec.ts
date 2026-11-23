import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyDomain } from '../domain/company.domain';
import { UserDomain } from '../domain/user.domain';
import { OwnerRecipientsService } from './owner-recipients.service';

function service(companyId: string | undefined, company: { locale: string } | null, members: object[]): OwnerRecipientsService {
    return new OwnerRecipientsService(
        { listMembers: vi.fn().mockResolvedValue(members) } as unknown as UserDomain,
        { findById: vi.fn().mockResolvedValue(company) } as unknown as CompanyDomain,
        { get: vi.fn().mockReturnValue({ requestId: 'req', companyId }) } as unknown as AppContext
    );
}

describe('OwnerRecipientsService', () => {
    it('lists only the owners, with the first name and the locale of the person or the company', async () => {
        const members: object[] = [
            { id: 'a', name: 'Ana Souza', email: 'ana@example.com', role: 'owner', locale: null },
            { id: 'b', name: 'Bob Lee', email: 'bob@example.com', role: 'editor', locale: null },
            { id: 'c', name: 'Cris Dias', email: 'cris@example.com', role: 'owner', locale: 'en' }
        ];

        expect(await service('company-1', { locale: 'pt-BR' }, members).list()).toEqual([
            { userId: 'a', email: 'ana@example.com', firstName: 'Ana', locale: 'pt-BR' },
            { userId: 'c', email: 'cris@example.com', firstName: 'Cris', locale: 'en' }
        ]);
    });

    it('returns nobody without a company in context or when the company is gone', async () => {
        expect(await service(undefined, null, []).list()).toEqual([]);
        expect(await service('company-1', null, []).list()).toEqual([]);
    });
});
