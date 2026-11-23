import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { RecurringApplicationModule } from '../../application/recurring-application.module';
import { RecurringController } from './recurring.controller';

@Module({
    imports: [RecurringApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [RecurringController]
})
export class RecurringHttpModule {}
