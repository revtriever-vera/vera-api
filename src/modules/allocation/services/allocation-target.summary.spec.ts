import { describe, expect, it, vi } from 'vitest';
import { makeClass } from '../../../../test/support/allocation-factories';
import { AllocationTargetSummary } from './allocation-target.summary';
import { ClassReaderService } from './class-reader.service';

describe('AllocationTargetSummary', () => {
    it('conta as classes com meta e informa a área target, sem valor monetário', async () => {
        const listForCompany = vi.fn().mockResolvedValue([makeClass({ targetBps: 5000 }), makeClass({ targetBps: 5000 }), makeClass()]);
        const summary = new AllocationTargetSummary({ listForCompany } as unknown as ClassReaderService);

        expect(summary.area).toBe('target');
        await expect(summary.summarize()).resolves.toEqual({ items: 2, amountCents: null, currency: null });
    });
});
