import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { mailConfig } from '../config/mail.config';
import { MailDeliveryError } from '../mail.errors';
import { formatAddress } from '../mail-address';
import { headersFor } from '../mail-headers';
import { MailPort } from '../mail.port';
import { Mail, MailReceipt } from '../mail.types';

const SMTP_PROVIDER: string = 'smtp';

@Injectable()
export class SmtpMailDriver extends MailPort {
    private readonly transporter: Transporter;
    private readonly address: string;
    private readonly fallbackName: string;

    public constructor(@Inject(mailConfig.KEY) config: ConfigType<typeof mailConfig>) {
        super();
        this.transporter = createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: false });
        this.address = config.MAIL_FROM_EMAIL;
        this.fallbackName = config.MAIL_FROM_NAME;
    }

    public async send(mail: Mail): Promise<MailReceipt> {
        try {
            const sent: unknown = await this.transporter.sendMail({
                from: formatAddress(mail.sender?.name ?? this.fallbackName, mail.sender?.email ?? this.address),
                replyTo: mail.sender?.replyTo,
                headers: headersFor(mail),
                to: mail.to.name ? `${mail.to.name} <${mail.to.email}>` : mail.to.email,
                subject: mail.subject,
                html: mail.html,
                text: mail.text
            });
            return { provider: SMTP_PROVIDER, providerMessageId: this.messageIdOf(sent), acceptedAt: new Date() };
        } catch (error) {
            throw new MailDeliveryError(error);
        }
    }

    private messageIdOf(sent: unknown): string | null {
        if (sent === null || typeof sent !== 'object') {
            return null;
        }
        const id: unknown = (sent as { messageId?: unknown }).messageId;
        return typeof id === 'string' ? id : null;
    }
}
