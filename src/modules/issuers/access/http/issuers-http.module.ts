import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { IssuersApplicationModule } from '../../application/issuers-application.module';
import { IssuersController } from './issuers.controller';

@Module({
    imports: [IssuersApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [IssuersController]
})
export class IssuersHttpModule {}
