import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ConfigType } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mailConfig } from '../config/mail.config';
import { MailDeliveryError } from '../mail.errors';
import { Mail, MailReceipt } from '../mail.types';
import { SesMailDriver } from './ses-mail.driver';

const send: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-sesv2', async (importOriginal: () => Promise<Record<string, unknown>>) => {
    const actual: Record<string, unknown> = await importOriginal();
    return {
        ...actual,
        SESv2Client: class {
            public send: ReturnType<typeof vi.fn> = send;
        }
    };
});

function driverOf(configurationSet: string = 'vera-transactional'): SesMailDriver {
    const config: ConfigType<typeof mailConfig> = {
        MAIL_FROM_EMAIL: 'no-reply@vera.example',
        MAIL_FROM_NAME: 'Vera',
        MAIL_CONFIGURATION_SET: configurationSet
    } as ConfigType<typeof mailConfig>;
    return new SesMailDriver(config);
}

function mailOf(overrides: Partial<Mail> = {}): Mail {
    return {
        to: { email: 'ana@cliente.com' },
        subject: 'Carrinho abandonado',
        html: '<p>oi</p>',
        text: 'oi',
        ...overrides
    };
}

function sentInput(): Record<string, unknown> {
    const command: SendEmailCommand = send.mock.calls[0]?.[0] as SendEmailCommand;
    return command.input as unknown as Record<string, unknown>;
}

describe('SesMailDriver', () => {
    beforeEach(() => {
        send.mockReset();
        send.mockResolvedValue({ MessageId: 'ses-123' });
    });

    it('sends with fallback sender, configuration set and returns the receipt', async () => {
        const receipt: MailReceipt = await driverOf().send(mailOf());
        const input: Record<string, unknown> = sentInput();
        expect(input.FromEmailAddress).toBe('Vera <no-reply@vera.example>');
        expect(input.ConfigurationSetName).toBe('vera-transactional');
        expect(input.ReplyToAddresses).toBeUndefined();
        expect(input.EmailTags).toBeUndefined();
        expect(receipt).toMatchObject({ provider: 'ses', providerMessageId: 'ses-123' });
    });

    it('uses the custom sender, reply-to and sanitized tags', async () => {
        await driverOf().send(
            mailOf({
                sender: { name: 'Acme Cobranças', email: 'cobranca@acme.com', replyTo: 'suporte@acme.com' },
                tags: { flow: 'fluxo padrão!', empty: '' }
            })
        );
        const input: Record<string, unknown> = sentInput();
        expect(input.FromEmailAddress).toContain('cobranca@acme.com');
        expect(input.ReplyToAddresses).toEqual(['suporte@acme.com']);
        expect(input.EmailTags).toEqual([{ Name: 'flow', Value: 'fluxo_padr_o_' }]);
    });

    it('omits the configuration set when not configured and null message id on missing MessageId', async () => {
        send.mockResolvedValue({});
        const receipt: MailReceipt = await driverOf('').send(mailOf());
        expect(sentInput().ConfigurationSetName).toBeUndefined();
        expect(receipt.providerMessageId).toBeNull();
    });

    it('wraps client failures in MailDeliveryError', async () => {
        send.mockRejectedValue(new Error('throttled'));
        await expect(driverOf().send(mailOf())).rejects.toBeInstanceOf(MailDeliveryError);
    });
});
