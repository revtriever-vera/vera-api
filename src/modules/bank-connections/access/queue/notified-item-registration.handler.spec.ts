import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { PluggyConnectApplication } from '../../application/pluggy-connect.application';
import { NotifiedItemRegistrationHandler } from './notified-item-registration.handler';

const ENVELOPE: QueueEnvelope = {
    type: 'bank-connections.pluggy-item.created',
    requestId: 'r-1',
    companyId: '00000000-0000-4000-8000-0000000000c1',
    occurredAt: '2026-11-28T12:00:00.000Z',
    trace: {},
    payload: { itemId: '00000000-0000-4000-8000-00000000a001', clientId: null, eventId: null }
};

function handlerOf(outcome: string): NotifiedItemRegistrationHandler {
    return new NotifiedItemRegistrationHandler({
        registerNotified: vi.fn().mockResolvedValue(outcome)
    } as unknown as PluggyConnectApplication);
}

describe('NotifiedItemRegistrationHandler', () => {
    it.each(['connected', 'already_connected', 'not_found', 'limit_reached', 'client_mismatch', 'credentials_unusable', 'ignored'])(
        'confirma o job quando o resultado é %s',
        async (outcome: string) => {
            await expect(handlerOf(outcome).handle(ENVELOPE)).resolves.toBeUndefined();
        }
    );

    it('falha o job para a fila tentar de novo quando a leitura do item falhou', async () => {
        await expect(handlerOf('failed').handle(ENVELOPE)).rejects.toThrow('pluggy_item_registration_failed');
    });
});
