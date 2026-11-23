import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { MailModule } from '../../../core/mail/mail.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { NoticesApplicationModule } from '../../notices/application/notices-application.module';
import { RecurringApplicationModule } from '../../recurring/application/recurring-application.module';
import { recurringNoticesConfig } from '../config/recurring-notices.config';
import { RecurringNoticesDomainModule } from '../domain/recurring-notices-domain.module';
import { RecurringNoticePublisherService } from '../services/recurring-notice-publisher.service';
import { RecurringNoticeSchedulerService } from '../services/recurring-notice-scheduler.service';
import { RecurringNoticesAccountEraser } from '../services/recurring-notices-account.eraser';
import { RecurringNoticesAccountExporter } from '../services/recurring-notices-account.exporter';
import { RecurringNoticesLogService } from '../services/recurring-notices-log.service';
import { RecurringNoticesMemberLifecycle } from '../services/recurring-notices.member.lifecycle';
import { RecurringNoticesRegistrar } from '../services/recurring-notices.registrar';
import { RecurringNoticeTemplates } from '../templates/recurring-notice.templates';
import { RecurringNoticeDeliveryApplication } from './recurring-notice-delivery.application';
import { RecurringNoticePrefsApplication } from './recurring-notice-prefs.application';

@Module({
    imports: [
        ConfigModule.forFeature(recurringNoticesConfig),
        RecurringNoticesDomainModule,
        RecurringApplicationModule,
        NoticesApplicationModule,
        IdentityApplicationModule,
        MailModule,
        QueueModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        RecurringNoticeDeliveryApplication,
        RecurringNoticePrefsApplication,
        RecurringNoticeSchedulerService,
        RecurringNoticePublisherService,
        RecurringNoticesRegistrar,
        RecurringNoticeTemplates,
        RecurringNoticesLogService,
        RecurringNoticesMemberLifecycle,
        RecurringNoticesAccountExporter,
        RecurringNoticesAccountEraser
    ],
    exports: [RecurringNoticeDeliveryApplication, RecurringNoticePrefsApplication]
})
export class RecurringNoticesApplicationModule {}
