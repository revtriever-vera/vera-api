import { ConfigType } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mailConfig } from '../config/mail.config';
import { MailDeliveryError } from '../mail.errors';
import { Mail, MailReceipt } from '../mail.types';
import { SmtpMailDriver } from './smtp-mail.driver';

const sendMail: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
    createTransport: () => ({ sendMail })
}));

function driverOf(): SmtpMailDriver {
    const config: ConfigType<typeof mailConfig> = {
        MAIL_FROM_EMAIL: 'no-reply@vera.example',
        MAIL_FROM_NAME: 'Vera',
        SMTP_HOST: 'localhost',
        SMTP_PORT: 1025
    } as ConfigType<typeof mailConfig>;
    return new SmtpMailDriver(config);
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

describe('SmtpMailDriver', () => {
    beforeEach(() => {
        sendMail.mockReset();
    });

    it('sends with the fallback sender and returns the provider messageId', async () => {
        sendMail.mockResolvedValue({ messageId: 'smtp-1' });

        const receipt: MailReceipt = await driverOf().send(mailOf());

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'Vera <no-reply@vera.example>', to: 'ana@cliente.com' }));
        expect(receipt).toMatchObject({ provider: 'smtp', providerMessageId: 'smtp-1' });
    });

    it('addresses the recipient by name when one is given', async () => {
        sendMail.mockResolvedValue({});

        await driverOf().send(mailOf({ to: { email: 'ana@cliente.com', name: 'Ana' } }));

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'Ana <ana@cliente.com>' }));
    });

    it('returns a null messageId when the provider response has none', async () => {
        sendMail.mockResolvedValue({});

        const receipt: MailReceipt = await driverOf().send(mailOf());

        expect(receipt.providerMessageId).toBeNull();
    });

    it('wraps transport failures in MailDeliveryError', async () => {
        sendMail.mockRejectedValue(new Error('connection refused'));

        await expect(driverOf().send(mailOf())).rejects.toBeInstanceOf(MailDeliveryError);
    });
});
