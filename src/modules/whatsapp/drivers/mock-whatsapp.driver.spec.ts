import { describe, expect, it } from 'vitest';
import { WhatsAppChannel } from '../domain/whatsapp.types';
import { MockOutbox } from '../services/mock-outbox.service';
import { MockWhatsAppDriver } from './mock-whatsapp.driver';

const CHANNEL: WhatsAppChannel = {
    phoneNumberId: 'phone-1',
    wabaId: 'w',
    accessToken: 't',
    appSecret: 's',
    verifyToken: 'v',
    displayNumber: null,
    companyId: null
};

describe('MockWhatsAppDriver', () => {
    it('guarda o que enviou em memória com wamid.mock.*', async () => {
        const outbox: MockOutbox = new MockOutbox();
        const driver: MockWhatsAppDriver = new MockWhatsAppDriver(outbox);

        const text = await driver.sendText(CHANNEL, '1', 'oi');
        const template = await driver.sendTemplate(CHANNEL, '1', { name: 'vera_lembrete', language: 'en', variables: ['a'] });
        const interactive = await driver.sendInteractive(CHANNEL, '1', { body: 'b', choices: [] });
        await driver.markRead();

        expect(text.wamid.startsWith('wamid.mock.')).toBe(true);
        expect(outbox.list().map((entry) => [entry.kind, entry.wamid])).toEqual([
            ['text', text.wamid],
            ['template', template.wamid],
            ['interactive', interactive.wamid]
        ]);
        outbox.clear();
        expect(outbox.list()).toEqual([]);
    });

    it('aprova o template na hora e recusa os de promoção', async () => {
        const driver: MockWhatsAppDriver = new MockWhatsAppDriver(new MockOutbox());

        await driver.submitTemplate(CHANNEL, {
            name: 'ok',
            language: 'pt_BR',
            category: 'UTILITY',
            body: 'Lembrete {{1}}',
            examples: ['x'],
            quickReplies: []
        });
        await driver.submitTemplate(CHANNEL, {
            name: 'promo',
            language: 'pt_BR',
            category: 'UTILITY',
            body: 'Grande OFERTA {{1}}',
            examples: ['x'],
            quickReplies: []
        });

        const listed = await driver.listTemplates(CHANNEL);
        expect(listed.map((entry) => [entry.name, entry.status])).toEqual([
            ['ok', 'APPROVED'],
            ['promo', 'REJECTED']
        ]);
        expect(await driver.phoneHealth()).toMatchObject({ qualityRating: 'GREEN' });
    });

    it('responde um número de exibição fixo', async () => {
        const driver: MockWhatsAppDriver = new MockWhatsAppDriver(new MockOutbox());

        expect(await driver.displayNumber()).toBe('+55 11 4000-0000');
    });
});
