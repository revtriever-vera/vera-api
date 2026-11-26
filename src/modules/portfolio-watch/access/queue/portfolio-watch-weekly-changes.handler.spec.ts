import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { PortfolioChangesApplication } from '../../application/portfolio-changes.application';
import { PortfolioWatchWeeklyChangesTickHandler } from '../commands/portfolio-watch-weekly-changes.command';
import { PortfolioWatchWeeklyChangesHandler } from './portfolio-watch-weekly-changes.handler';

const COMPANY: string = '0199b5b8-1c2d-7000-8000-000000000001';

function envelope(payload: unknown): QueueEnvelope {
    return { type: 'x', requestId: 'r', companyId: null, occurredAt: '2026-12-07T11:00:00Z', trace: {}, payload };
}

function handlerOf(evaluateWeekly: ReturnType<typeof vi.fn>): PortfolioWatchWeeklyChangesHandler {
    const redis = { acquireLock: vi.fn().mockResolvedValue(true), releaseLock: vi.fn().mockResolvedValue(undefined) };
    return new PortfolioWatchWeeklyChangesHandler(
        { evaluateWeekly } as unknown as PortfolioChangesApplication,
        redis as unknown as RedisConnection
    );
}

describe('handlers do e-mail semanal "O que mudou"', () => {
    it('avalia a conta do payload', async () => {
        const evaluateWeekly = vi.fn().mockResolvedValue(1);

        await handlerOf(evaluateWeekly).handle(envelope({ companyId: COMPANY }));

        expect(evaluateWeekly).toHaveBeenCalledWith(COMPANY);
    });

    it('payload inválido é descartado sem tentar de novo', async () => {
        const evaluateWeekly = vi.fn();

        await handlerOf(evaluateWeekly).handle(envelope({ companyId: 'nope' }));

        expect(evaluateWeekly).not.toHaveBeenCalled();
    });

    it('o tick de segunda às 8h dispara a varredura', async () => {
        const fanOutWeekly = vi.fn().mockResolvedValue(0);

        await new PortfolioWatchWeeklyChangesTickHandler({ fanOutWeekly } as unknown as PortfolioChangesApplication).handle(envelope({}));

        expect(fanOutWeekly).toHaveBeenCalledOnce();
    });
});
