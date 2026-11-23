import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { MailModule } from '../../../core/mail/mail.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { noticesConfig } from '../config/notices.config';
import { NoticesDomainModule } from '../domain/notices-domain.module';
import { NoticeService } from '../services/notice.service';
import { NoticeTypeRegistry } from '../services/notice-type.registry';
import { NoticeUnsubscribeService } from '../services/notice-unsubscribe.service';
import { NoticesAccountExporter } from '../services/notices-account.exporter';
import { NoticesLogService } from '../services/notices-log.service';
import { NoticesMemberLifecycle } from '../services/notices-member.lifecycle';
import { UnsubscribeLinkService } from '../services/unsubscribe-link.service';
import { NoticePreferencesApplication } from './notice-preferences.application';
import { NoticeUnsubscribeApplication } from './notice-unsubscribe.application';

@Module({
    imports: [
        ConfigModule.forFeature(noticesConfig),
        NoticesDomainModule,
        IdentityApplicationModule,
        CryptoModule,
        MailModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        NoticePreferencesApplication,
        NoticeUnsubscribeApplication,
        NoticeService,
        NoticeTypeRegistry,
        NoticeUnsubscribeService,
        UnsubscribeLinkService,
        NoticesLogService,
        NoticesAccountExporter,
        NoticesMemberLifecycle
    ],
    exports: [NoticePreferencesApplication, NoticeUnsubscribeApplication, NoticeService, NoticeTypeRegistry]
})
export class NoticesApplicationModule {}
