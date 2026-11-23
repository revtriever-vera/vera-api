import { describe, expect, it, vi } from 'vitest';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { detectJobId, RecurringDetectPublisherService, untilWindowEnd } from './recurring-detect-publisher.service';

const WINDOW: number = 600_000;

describe('RecurringDetectPublisherService', () => {
    it('o jobId é da company e da janela de 10 minutos, então uma rajada vira um job só', () => {
        const start: number = 40 * WINDOW;

        expect(detectJobId('c1', start)).toBe(detectJobId('c1', start + WINDOW - 1));
        expect(detectJobId('c1', start)).not.toBe(detectJobId('c1', start + WINDOW));
        expect(detectJobId('c1', start)).not.toBe(detectJobId('c2', start));
        expect(detectJobId('c1', start)).toBe('recurring-detect-c1-40');
    });

    it('o job espera o fim da janela, para pegar o que chegar durante a rajada', () => {
        expect(untilWindowEnd(40 * WINDOW)).toBe(WINDOW);
        expect(untilWindowEnd(40 * WINDOW + 599_000)).toBe(1000);
    });

    it('publica só o id da company, com jobId determinístico e atraso até o fim da janela', async () => {
        const publish: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const service: RecurringDetectPublisherService = new RecurringDetectPublisherService({ publish } as unknown as QueuePublisherPort);

        await service.request('c1', 40 * WINDOW + 100_000);

        expect(publish).toHaveBeenCalledWith(
            QUEUES.recurring,
            MESSAGE_TYPES.recurringDetectRequested,
            { companyId: 'c1' },
            {
                jobId: 'recurring-detect-c1-40',
                delayMs: 500_000
            }
        );
    });
});
