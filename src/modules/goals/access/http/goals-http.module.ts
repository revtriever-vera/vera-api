import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { GoalsApplicationModule } from '../../application/goals-application.module';
import { GoalsController } from './goals.controller';

@Module({
    imports: [GoalsApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [GoalsController]
})
export class GoalsHttpModule {}
