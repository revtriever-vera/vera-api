import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { ConcentrationApplicationModule } from '../../application/concentration-application.module';
import { ConcentrationController } from './concentration.controller';

@Module({
    imports: [ConcentrationApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [ConcentrationController]
})
export class ConcentrationHttpModule {}
