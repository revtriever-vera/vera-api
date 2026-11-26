import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { PortfolioWatchDailyApplication } from '../../application/portfolio-watch-daily.application';
import { PortfolioWatchDailyTickHandler } from '../commands/portfolio-watch-daily.command';
import { PortfolioWatchDailyHandler } from './portfolio-watch-daily.handler';

const COMPANY: string = '0199b5b8-1c2d-7000-8000-000000000001';

function envelope(payload: unknown): QueueEnvelope {
    return { type: 'x', requestId: 'r', companyId: null, occurredAt: '2026-12-01T12:00:00Z', trace: {}, payload };
}

function handlerOf(evaluate: ReturnType<typeof vi.fn>): PortfolioWatchDailyHandler {
    const redis = { acquireLock: vi.fn().mockResolvedValue(true), releaseLock: vi.fn().mockResolvedValue(undefined) };
    return new PortfolioWatchDailyHandler({ evaluate } as unknown as PortfolioWatchDailyApplication, redis as unknown as RedisConnection);
}

describe('handlers dos avisos diários da carteira', () => {
    it('avalia a conta do payload', async () => {
        const evaluate = vi.fn().mockResolvedValue(1);

        await handlerOf(evaluate).handle(envelope({ companyId: COMPANY }));

        expect(evaluate).toHaveBeenCalledWith(COMPANY);
    });

    it('payload inválido é descartado sem tentar de novo', async () => {
        const evaluate = vi.fn();

        await handlerOf(evaluate).handle(envelope({ companyId: 'nope' }));

        expect(evaluate).not.toHaveBeenCalled();
    });

    it('o tick das 9h dispara a varredura', async () => {
        const fanOutDaily = vi.fn().mockResolvedValue(0);

        await new PortfolioWatchDailyTickHandler({ fanOutDaily } as unknown as PortfolioWatchDailyApplication).handle(envelope({}));

        expect(fanOutDaily).toHaveBeenCalledOnce();
    });
});
