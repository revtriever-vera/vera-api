import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { EmailContent, SendEmailCommand, SendEmailCommandOutput, SESv2Client } from '@aws-sdk/client-sesv2';
import { mailConfig } from '../config/mail.config';
import { MailDeliveryError } from '../mail.errors';
import { formatAddress } from '../mail-address';
import { headersFor } from '../mail-headers';
import { MailPort } from '../mail.port';
import { Mail, MailReceipt } from '../mail.types';

function tagsOf(tags: Readonly<Record<string, string>> | undefined): { Name: string; Value: string }[] | undefined {
    const entries: [string, string][] = Object.entries(tags ?? {}).filter(([, value]: [string, string]) => value.length > 0);
    return entries.length === 0 ? undefined : entries.map(([Name, Value]: [string, string]) => ({ Name, Value: safeTag(Value) }));
}

function safeTag(value: string): string {
    return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);
}

const SES_PROVIDER: string = 'ses';

@Injectable()
export class SesMailDriver extends MailPort {
    private readonly client: SESv2Client = new SESv2Client({});
    private readonly address: string;
    private readonly fallbackName: string;
    private readonly configurationSet: string;

    public constructor(@Inject(mailConfig.KEY) config: ConfigType<typeof mailConfig>) {
        super();
        this.address = config.MAIL_FROM_EMAIL;
        this.fallbackName = config.MAIL_FROM_NAME;
        this.configurationSet = config.MAIL_CONFIGURATION_SET;
    }

    private contentOf(mail: Mail): EmailContent {
        return {
            Simple: {
                Headers: Object.entries(headersFor(mail)).map(([Name, Value]: [string, string]) => ({ Name, Value })),
                Subject: { Data: mail.subject },
                Body: {
                    Html: { Data: mail.html },
                    Text: { Data: mail.text }
                }
            }
        };
    }

    private commandOf(mail: Mail): SendEmailCommand {
        return new SendEmailCommand({
            ConfigurationSetName: this.configurationSet.length > 0 ? this.configurationSet : undefined,
            EmailTags: tagsOf(mail.tags),
            FromEmailAddress: formatAddress(mail.sender?.name ?? this.fallbackName, mail.sender?.email ?? this.address),
            ReplyToAddresses: mail.sender?.replyTo ? [mail.sender.replyTo] : undefined,
            Destination: { ToAddresses: [mail.to.email] },
            Content: this.contentOf(mail)
        });
    }

    public async send(mail: Mail): Promise<MailReceipt> {
        try {
            const sent: SendEmailCommandOutput = await this.client.send(this.commandOf(mail));
            return { provider: SES_PROVIDER, providerMessageId: sent.MessageId ?? null, acceptedAt: new Date() };
        } catch (error) {
            throw new MailDeliveryError(error);
        }
    }
}
