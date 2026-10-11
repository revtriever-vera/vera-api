import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { IdentityApplicationModule } from '../application/identity-application.module';
import { AuthController } from './auth.controller';

@Module({
    imports: [IdentityApplicationModule, ContextModule],
    controllers: [AuthController]
})
export class IdentityHttpModule {}
