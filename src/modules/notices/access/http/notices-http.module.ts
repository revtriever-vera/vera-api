import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { NoticesApplicationModule } from '../../application/notices-application.module';
import { NotificationsController } from './notifications.controller';

@Module({
    imports: [NoticesApplicationModule, IdentityApplicationModule, ContextModule, ThrottleModule],
    controllers: [NotificationsController]
})
export class NoticesHttpModule {}
