import { Module } from '@nestjs/common';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { ContextModule } from '../../../core/context/context.module';
import { IdentityApplicationModule } from '../application/identity-application.module';
import { AuthController } from './auth.controller';

@Module({
    imports: [IdentityApplicationModule, ContextModule, ThrottleModule],
    controllers: [AuthController]
})
export class IdentityHttpModule {}
