import { describe, expect, it, vi } from 'vitest';
import { GoalNoticesAccountEraser } from './goal-notices-account.eraser';
import { GoalNoticesPublisherService, evaluateJobId } from './goal-notices-publisher.service';

function build() {
    const publish = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const publisher = new GoalNoticesPublisherService({ publish, remove });
    return { publisher, publish, remove };
}

describe('GoalNoticesPublisherService', () => {
    it('o jobId não tem dois pontos, que o BullMQ recusa, e muda por empresa e por dia', () => {
        expect(evaluateJobId('c1', '2026-12-01')).toBe('goal-notices-c1-2026-12-01');
        expect(evaluateJobId('c1', '2026-12-01')).not.toContain(':');
    });

    it('publica a avaliação com o jobId determinístico', async () => {
        const { publisher, publish } = build();

        await publisher.request('c1', '2026-12-01');

        expect(publish).toHaveBeenCalledWith(
            'vera-goal-notices',
            'goal-notices.evaluate.requested',
            { companyId: 'c1' },
            { jobId: 'goal-notices-c1-2026-12-01' }
        );
    });

    it('cancela o job de ontem e o de hoje', async () => {
        const { publisher, remove } = build();

        await publisher.cancel('c1', '2026-12-01');

        expect(remove).toHaveBeenCalledWith('vera-goal-notices', 'goal-notices-c1-2026-11-30');
        expect(remove).toHaveBeenCalledWith('vera-goal-notices', 'goal-notices-c1-2026-12-01');
    });

    it('a exclusão de conta cancela os jobs pendentes e devolve zero itens apagados', async () => {
        const { publisher, remove } = build();

        const erased: number = await new GoalNoticesAccountEraser(publisher).eraseAll('c1');

        expect(erased).toBe(0);
        expect(remove).toHaveBeenCalledTimes(2);
    });
});
