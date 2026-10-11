import { describe, expect, it, vi } from 'vitest';
import { AllowlistMailPort, BLOCKED_PROVIDER } from './allowlist-mail.port';
import { MailLogService } from './mail-log.service';
import { MailPort } from './mail.port';
import { Mail, MailReceipt } from './mail.types';

function mailTo(email: string): Mail {
    return { to: { email }, subject: 'Assunto', html: '<p>oi</p>', text: 'oi' };
}

function driverStub(): { driver: MailPort; send: ReturnType<typeof vi.fn> } {
    const send: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<MailReceipt> =>
        Promise.resolve({ provider: 'stub', providerMessageId: 'id-1', acceptedAt: new Date() })
    );
    return { driver: { send }, send };
}

function logsStub(): { logs: MailLogService; recipientBlocked: ReturnType<typeof vi.fn> } {
    const recipientBlocked: ReturnType<typeof vi.fn> = vi.fn();
    return { logs: { recipientBlocked } as unknown as MailLogService, recipientBlocked };
}

describe('AllowlistMailPort', () => {
    it('allows everything when the allowlist is the wildcard', async () => {
        const { driver, send } = driverStub();
        const { logs } = logsStub();
        const port: AllowlistMailPort = new AllowlistMailPort(driver, ['*'], logs);

        const receipt: MailReceipt = await port.send(mailTo('anyone@example.test'));

        expect(receipt.provider).toBe('stub');
        expect(send).toHaveBeenCalledOnce();
    });

    it('allows an exact address match', async () => {
        const { driver, send } = driverStub();
        const { logs } = logsStub();
        const port: AllowlistMailPort = new AllowlistMailPort(driver, ['ana@cliente.com'], logs);

        await port.send(mailTo('Ana@Cliente.com'));

        expect(send).toHaveBeenCalledOnce();
    });

    it('allows every address under an allowed domain', async () => {
        const { driver, send } = driverStub();
        const { logs } = logsStub();
        const port: AllowlistMailPort = new AllowlistMailPort(driver, ['@cliente.com'], logs);

        await port.send(mailTo('qualquer@cliente.com'));

        expect(send).toHaveBeenCalledOnce();
    });

    it('blocks and logs a recipient outside the allowlist, without touching the driver', async () => {
        const { driver, send } = driverStub();
        const { logs, recipientBlocked } = logsStub();
        const port: AllowlistMailPort = new AllowlistMailPort(driver, ['@cliente.com'], logs);

        const receipt: MailReceipt = await port.send(mailTo('fora@outraempresa.com'));

        expect(receipt.provider).toBe(BLOCKED_PROVIDER);
        expect(receipt.providerMessageId).toBeNull();
        expect(send).not.toHaveBeenCalled();
        expect(recipientBlocked).toHaveBeenCalledWith('@outraempresa.com');
    });
});
