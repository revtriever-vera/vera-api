import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { PortfolioWatchSnapshotApplication } from '../../application/portfolio-watch-snapshot.application';
import { PortfolioWatchMonthlySnapshotTickHandler } from '../commands/portfolio-watch-monthly-snapshot.command';
import { PortfolioWatchSnapshotHandler } from './portfolio-watch-snapshot.handler';

const COMPANY: string = '0199b5b8-1c2d-7000-8000-000000000001';

function envelope(payload: unknown): QueueEnvelope {
    return { type: 'x', requestId: 'r', companyId: null, occurredAt: '2026-12-01T07:00:00Z', trace: {}, payload };
}

describe('handlers da foto mensal', () => {
    it('tira a foto da empresa do payload', async () => {
        const snapshotCompany = vi.fn().mockResolvedValue(1);

        await new PortfolioWatchSnapshotHandler({ snapshotCompany } as unknown as PortfolioWatchSnapshotApplication).handle(
            envelope({ companyId: COMPANY })
        );

        expect(snapshotCompany).toHaveBeenCalledWith(COMPANY);
    });

    it('payload inválido é descartado sem tentar de novo', async () => {
        const snapshotCompany = vi.fn();

        await new PortfolioWatchSnapshotHandler({ snapshotCompany } as unknown as PortfolioWatchSnapshotApplication).handle(
            envelope({ companyId: 'nope' })
        );

        expect(snapshotCompany).not.toHaveBeenCalled();
    });

    it('o tick do dia 1 dispara a varredura', async () => {
        const fanOutMonthly = vi.fn().mockResolvedValue(0);

        await new PortfolioWatchMonthlySnapshotTickHandler({ fanOutMonthly } as unknown as PortfolioWatchSnapshotApplication).handle(
            envelope({})
        );

        expect(fanOutMonthly).toHaveBeenCalledOnce();
    });
});
