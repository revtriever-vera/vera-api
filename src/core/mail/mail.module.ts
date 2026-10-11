import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ObservabilityModule } from '../observability/observability.module';
import { QueueModule } from '../queue/queue.module';
import { EmailSendHandler } from './access/email-send.handler';
import { mailConfig } from './config/mail.config';
import { SesMailDriver } from './drivers/ses-mail.driver';
import { SmtpMailDriver } from './drivers/smtp-mail.driver';
import { AllowlistMailPort } from './allowlist-mail.port';
import { MailLogService } from './mail-log.service';
import { MailerPort, QueueMailer } from './mailer.port';
import { MailPort } from './mail.port';
import { TemplateRegistry } from './template.registry';

@Module({
    imports: [ConfigModule.forFeature(mailConfig), ObservabilityModule, QueueModule],
    providers: [
        SmtpMailDriver,
        SesMailDriver,
        MailLogService,
        {
            provide: MailPort,
            inject: [mailConfig.KEY, SmtpMailDriver, SesMailDriver, MailLogService],
            useFactory: (
                config: ConfigType<typeof mailConfig>,
                smtp: SmtpMailDriver,
                ses: SesMailDriver,
                logs: MailLogService
            ): MailPort => {
                const driver: MailPort = config.MAIL_DRIVER === 'ses' ? ses : smtp;
                return new AllowlistMailPort(driver, config.MAIL_ALLOWED_RECIPIENTS, logs);
            }
        },
        { provide: MailerPort, useClass: QueueMailer },
        TemplateRegistry,
        EmailSendHandler
    ],
    exports: [MailerPort, TemplateRegistry]
})
export class MailModule {}
