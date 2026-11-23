import { describe, expect, it, vi } from 'vitest';
import { PaidUsageEntryDomain } from '../domain/paid-usage-entry.domain';
import { PaidUsageNoticeDomain } from '../domain/paid-usage-notice.domain';
import { UsageContextHolder } from '../ports/usage-context.holder';
import { PaidUsageHistoryService } from './paid-usage-history.service';
import { UsageSnapshotService } from './usage-snapshot.service';

function build() {
    const entries = {
        aggregateSince: vi.fn().mockResolvedValue([]),
        eraseAll: vi.fn().mockResolvedValue(3),
        purgeBefore: vi.fn().mockResolvedValue(2),
        companiesWithUsage: vi.fn().mockResolvedValue([{ companyId: 'c', usedMicros: 1 }])
    };
    const notices = { eraseAll: vi.fn().mockResolvedValue(1) };
    const snapshots = { invalidate: vi.fn() };
    const service: PaidUsageHistoryService = new PaidUsageHistoryService(
        entries as unknown as PaidUsageEntryDomain,
        notices as unknown as PaidUsageNoticeDomain,
        { timezone: vi.fn().mockResolvedValue('America/Sao_Paulo') } as unknown as UsageContextHolder,
        snapshots as unknown as UsageSnapshotService
    );
    return { service, entries, snapshots };
}

describe('PaidUsageHistoryService', () => {
    it('exporta o mês corrente e os 12 anteriores', async () => {
        const { service, entries } = build();

        await service.aggregateForExport(new Date('2026-11-15T12:00:00.000Z'));

        expect(entries.aggregateSince).toHaveBeenCalledWith('2025-11');
    });

    it('apaga razão e avisos e invalida o cache', async () => {
        const { service, snapshots } = build();

        expect(await service.eraseAll()).toBe(4);
        expect(snapshots.invalidate).toHaveBeenCalled();
    });

    it('apaga o que passou de 13 meses', async () => {
        const { service, entries } = build();

        expect(await service.purgeExpired(new Date('2026-11-15T00:00:00.000Z'))).toBe(2);
        expect(entries.purgeBefore).toHaveBeenCalledWith(new Date('2025-10-15T00:00:00.000Z'));
    });

    it('lista as companies com uso no período', async () => {
        expect(await build().service.companiesWithUsage('2026-11')).toEqual([{ companyId: 'c', usedMicros: 1 }]);
    });
});
