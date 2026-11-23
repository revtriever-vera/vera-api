import { describe, expect, it, vi } from 'vitest';
import { SendPriceUnavailableError } from '../../../core/usage/usage.errors';
import { ReminderDeliveryService } from './reminder-delivery.service';

describe('ReminderDeliveryService', () => {
    it('preço indisponível vira unreached/send_failed e não relança (o job não repete)', async () => {
        const domain = { templateSendsBetween: vi.fn().mockResolvedValue(0) };
        const sendMeter = { estimate: vi.fn().mockRejectedValue(new SendPriceUnavailableError('utility')) };
        const usage = { assertRoom: vi.fn() };
        const service = new ReminderDeliveryService(
            domain as never,
            {} as never,
            {} as never,
            sendMeter as never,
            usage as never,
            { REMINDERS_MAX_TEMPLATE_SENDS_MONTH: 100 } as never
        );
        const reminder = { id: 'r', text: 't', timezone: 'America/Sao_Paulo' };
        const outcome = await service.deliverTemplate(
            reminder as never,
            { id: 'o' } as never,
            { peer: 'p', locale: 'pt-BR' } as never,
            new Date('2026-11-23T12:00:00Z')
        );
        expect(outcome).toEqual({ kind: 'unreached', reason: 'send_failed' });
    });
});
