import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { MailModule } from '../../../core/mail/mail.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { GoalsApplicationModule } from '../../goals/application/goals-application.module';
import { NoticesApplicationModule } from '../../notices/application/notices-application.module';
import { goalNoticesConfig } from '../config/goal-notices.config';
import { GoalNoticesDomainModule } from '../domain/goal-notices-domain.module';
import { GoalBehindNoticeRegistrar } from '../services/goal-behind-notice.registrar';
import { GoalBehindTemplates } from '../services/goal-behind.templates';
import { GoalNoticesAccountEraser } from '../services/goal-notices-account.eraser';
import { GoalNoticesLogService } from '../services/goal-notices-log.service';
import { GoalNoticesPublisherService } from '../services/goal-notices-publisher.service';
import { GoalNoticesApplication } from './goal-notices.application';

@Module({
    imports: [
        ConfigModule.forFeature(goalNoticesConfig),
        GoalNoticesDomainModule,
        GoalsApplicationModule,
        NoticesApplicationModule,
        MailModule,
        QueueModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        GoalNoticesApplication,
        GoalBehindNoticeRegistrar,
        GoalBehindTemplates,
        GoalNoticesAccountEraser,
        GoalNoticesLogService,
        GoalNoticesPublisherService
    ],
    exports: [GoalNoticesApplication]
})
export class GoalNoticesApplicationModule {}
