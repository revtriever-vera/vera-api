import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { AnswerApplication } from '../../application/answer.application';
import { TurnApplication } from '../../application/turn.application';
import { TurnAnsweredHandler } from './answer.handler';
import { TurnRequestedHandler } from './turn.handler';

const ID: string = '0192b6c0-0000-7000-8000-000000000001';

function envelope(type: string, payload: unknown): QueueEnvelope {
    return { type, requestId: 'r', companyId: null, occurredAt: new Date().toISOString(), trace: {}, payload };
}

describe('handlers do turno do WhatsApp', () => {
    it('declaram a fila vera-whatsapp e o tipo de cada job', () => {
        expect(
            [new TurnRequestedHandler({} as never), new TurnAnsweredHandler({} as never)].map((handler) => [handler.queue, handler.type])
        ).toEqual([
            ['vera-whatsapp', 'whatsapp.turn.requested'],
            ['vera-whatsapp', 'whatsapp.turn.answered']
        ]);
    });

    it('entregam o payload válido às applications', async () => {
        const run = vi.fn().mockResolvedValue(undefined);
        const deliver = vi.fn().mockResolvedValue(undefined);
        const answered = {
            wamid: 'w',
            linkId: ID,
            peer: '5511999990001',
            text: 'ok',
            locale: 'pt-BR',
            portfolio: false,
            receivedAt: new Date().toISOString(),
            proposals: []
        };

        await new TurnRequestedHandler({ run } as unknown as TurnApplication).handle(envelope('x', { wamid: 'w', linkId: ID }));
        await new TurnAnsweredHandler({ deliver } as unknown as AnswerApplication).handle(envelope('x', answered));

        expect(run).toHaveBeenCalledWith({ wamid: 'w', linkId: ID });
        expect(deliver).toHaveBeenCalledWith(answered);
    });

    it('descartam payload inválido sem lançar, para não repetir um job impossível', async () => {
        const run = vi.fn();
        const deliver = vi.fn();

        await new TurnRequestedHandler({ run } as unknown as TurnApplication).handle(envelope('x', { wamid: '' }));
        await new TurnAnsweredHandler({ deliver } as unknown as AnswerApplication).handle(envelope('x', null));

        expect(run).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });
});
