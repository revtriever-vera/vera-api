import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AccountDeletionLogRepository } from '../repositories/account-deletion-log.repository';
import { AccountDeletionLogDomain } from './account-deletion-log.domain';

const COMPANY_ID: string = '00000000-0000-4000-8000-000000000001';

describe('AccountDeletionLogDomain', () => {
    it('grava a trilha com o SHA-256 do companyId e sem o uuid', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'log-1' });
        const domain: AccountDeletionLogDomain = new AccountDeletionLogDomain({ create } as unknown as AccountDeletionLogRepository);
        const requestedAt: Date = new Date('2026-01-01T00:00:00Z');
        const completedAt: Date = new Date('2026-01-01T00:00:01Z');

        await domain.record({ companyId: COMPANY_ID, requestedAt, completedAt, areas: [{ area: 'assets', erased: 2 }] });

        const expectedHash: string = createHash('sha256').update(COMPANY_ID).digest('hex');
        expect(create).toHaveBeenCalledWith({
            companyHash: expectedHash,
            requestedAt,
            completedAt,
            areas: '[{"area":"assets","erased":2}]'
        });
        expect(JSON.stringify(create.mock.calls)).not.toContain(COMPANY_ID);
    });

    it('busca a trilha pelo hash do companyId', async () => {
        const findByCompanyHash: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([]);
        const domain: AccountDeletionLogDomain = new AccountDeletionLogDomain({
            findByCompanyHash
        } as unknown as AccountDeletionLogRepository);

        await domain.findByCompanyId(COMPANY_ID);

        expect(findByCompanyHash).toHaveBeenCalledWith(domain.hashOf(COMPANY_ID));
    });
});
