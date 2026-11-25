import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { PortfolioIncomeLedgerDomain } from '../domain/portfolio-income-ledger.domain';
import { PortfolioIncomeLedgerService } from './portfolio-income-ledger.service';
import { PortfolioWatchLogService } from './portfolio-watch-log.service';

const EVENT = { eventId: 'e1', assetId: 'a1', amountPerUnit: '0.78', currency: 'BRL', paymentDate: '2026-12-14' };

function build(positions: unknown[], recorded: boolean = true) {
    ContextHolder.set({
        get: () => ({}),
        run: (_context: unknown, fn: () => Promise<unknown>) => fn()
    } as unknown as AppContext);
    const record = vi.fn().mockResolvedValue(recorded);
    const service = new PortfolioIncomeLedgerService(
        { listForCompany: vi.fn().mockResolvedValue(positions) } as unknown as PositionReaderService,
        { record } as unknown as PortfolioIncomeLedgerDomain,
        { incomeRecorded: vi.fn() } as unknown as PortfolioWatchLogService
    );
    return { service, record };
}

describe('PortfolioIncomeLedgerService', () => {
    it('soma a quantidade dos donos e grava o valor na data-com', async () => {
        const { service, record } = build([
            { assetId: 'a1', quantity: '100', isSample: false },
            { assetId: 'a1', quantity: '50.5', isSample: false },
            { assetId: 'a2', quantity: '9', isSample: false }
        ]);

        expect(await service.recordEvent('c1', EVENT)).toBe(true);
        expect(record).toHaveBeenCalledWith({
            eventId: 'e1',
            assetId: 'a1',
            quantityAtExDate: '150.5',
            amountMinor: 11739,
            currency: 'BRL',
            paymentDate: '2026-12-14'
        });
    });

    it('posição zerada, ausente ou de exemplo não grava', async () => {
        for (const positions of [
            [],
            [{ assetId: 'a1', quantity: '0', isSample: false }],
            [{ assetId: 'a1', quantity: '10', isSample: true }]
        ]) {
            const { service, record } = build(positions);

            expect(await service.recordEvent('c1', EVENT)).toBe(false);
            expect(record).not.toHaveBeenCalled();
        }
    });
});
