import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { MembersLogService } from '../services/members-log.service';
import { MembersCleanupApplication } from './members-cleanup.application';

const context: AlsAppContext = new AlsAppContext();
ContextHolder.set(context);

const NOW: Date = new Date('2026-03-31T04:00:00.000Z');

function user(id: string): User {
    return { id, companyId: `company-${id}` } as User;
}

describe('MembersCleanupApplication', () => {
    it('anonimiza quem foi removido há 30 dias ou mais, na company de cada um', async () => {
        const find: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([user('a'), user('b')]);
        const anonymize: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => Promise.resolve(context.get().companyId));
        const anonymized: ReturnType<typeof vi.fn> = vi.fn();
        const application: MembersCleanupApplication = new MembersCleanupApplication(
            { findRemovedToAnonymize: find, anonymize } as unknown as UserDomain,
            { anonymized } as unknown as MembersLogService
        );

        const total: number = await context.run({ requestId: 'tick', locale: 'pt-BR' }, async () => application.anonymizeRemoved(NOW));

        expect(total).toBe(2);
        expect(find).toHaveBeenCalledWith(new Date('2026-03-01T04:00:00.000Z'), 200);
        expect(anonymize.mock.calls).toEqual([['a'], ['b']]);
        expect(await anonymize.mock.results[1]?.value).toBe('company-b');
        expect(anonymized).toHaveBeenCalledWith(2);
    });
});
