import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { RemindersApplicationModule } from '../../application/reminders-application.module';
import { RemindersController } from './reminders.controller';

@Module({
    imports: [RemindersApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [RemindersController]
})
export class RemindersHttpModule {}
