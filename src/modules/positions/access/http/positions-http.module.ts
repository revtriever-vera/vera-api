import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PositionsApplicationModule } from '../../application/positions-application.module';
import { PositionsController } from './positions.controller';

@Module({
    imports: [PositionsApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [PositionsController]
})
export class PositionsHttpModule {}
