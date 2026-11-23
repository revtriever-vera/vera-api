import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { PlatformAuditEntry, User } from '../domain/identity.types';
import { PlatformAuditDomain } from '../domain/platform-audit.domain';
import { UserDomain } from '../domain/user.domain';
import { SupportAccessService } from './support-access.service';

const context: AlsAppContext = new AlsAppContext();

function entry(id: string, operatorUserId: string | null, meta: unknown): PlatformAuditEntry {
    return {
        id,
        operatorUserId,
        action: 'account.viewed',
        targetCompanyId: 'company-1',
        meta,
        createdAt: new Date('2026-06-01T10:00:00Z')
    } as PlatformAuditEntry;
}

describe('SupportAccessService', () => {
    it('lists the openings of the current account with operator name, reason and layers', async () => {
        const listOfTarget = vi
            .fn()
            .mockResolvedValue([
                entry('a1', 'op-1', { reason: 'Ajuda com a carteira', layers: ['summary', 'data'] }),
                entry('a2', 'op-gone', { reason: 'Cobrança', layers: ['summary'] }),
                entry('a3', null, null)
            ]);
        const findMany = vi.fn().mockResolvedValue([{ id: 'op-1', name: 'Bia Suporte' } as User]);
        const service: SupportAccessService = new SupportAccessService(
            { listOfTarget } as unknown as PlatformAuditDomain,
            { findManyByIdsAcrossTenants: findMany } as unknown as UserDomain,
            context
        );

        const items = await context.run({ requestId: 'r', companyId: 'company-1', locale: 'pt-BR' }, async () =>
            service.listForCurrentAccount()
        );

        expect(listOfTarget).toHaveBeenCalledWith('company-1', 'account.viewed', 100);
        expect(findMany).toHaveBeenCalledWith(['op-1', 'op-gone']);
        expect(items.map((item) => item.operatorName)).toEqual(['Bia Suporte', null, null]);
        expect(items[0]).toMatchObject({ reason: 'Ajuda com a carteira', layers: ['summary', 'data'] });
        expect(items[2]).toMatchObject({ reason: '', layers: [] });
    });
});
