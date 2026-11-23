import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { GoalNoticesApplication } from '../../application/goal-notices.application';
import { GoalNoticesDailyTickHandler } from '../commands/goal-notices-daily.command';
import { GoalNoticesEvaluateHandler } from './goal-notices-evaluate.handler';

const COMPANY: string = '0199b5b8-1c2d-7000-8000-000000000001';

function envelope(payload: unknown): QueueEnvelope {
    return { type: 'x', requestId: 'r', companyId: null, occurredAt: '2026-12-01T12:00:00Z', trace: {}, payload };
}

describe('handlers de avisos de objetivo', () => {
    it('avalia a empresa do payload', async () => {
        const evaluate = vi.fn().mockResolvedValue(1);
        const handler = new GoalNoticesEvaluateHandler({ evaluate } as unknown as GoalNoticesApplication);

        await handler.handle(envelope({ companyId: COMPANY }));

        expect(evaluate).toHaveBeenCalledWith(COMPANY);
    });

    it('payload inválido é descartado sem tentar de novo', async () => {
        const evaluate = vi.fn();
        const handler = new GoalNoticesEvaluateHandler({ evaluate } as unknown as GoalNoticesApplication);

        await handler.handle(envelope({ companyId: 'nope' }));

        expect(evaluate).not.toHaveBeenCalled();
    });

    it('o tick diário dispara a varredura', async () => {
        const fanOutDaily = vi.fn().mockResolvedValue(0);

        await new GoalNoticesDailyTickHandler({ fanOutDaily } as unknown as GoalNoticesApplication).handle(envelope({}));

        expect(fanOutDaily).toHaveBeenCalledOnce();
    });
});
