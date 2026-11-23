import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { RecurringNoticesApplicationModule } from '../../application/recurring-notices-application.module';
import { RecurringNoticesController } from './recurring-notices.controller';

@Module({
    imports: [RecurringNoticesApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [RecurringNoticesController]
})
export class RecurringNoticesHttpModule {}
