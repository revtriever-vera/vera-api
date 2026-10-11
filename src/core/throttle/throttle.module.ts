import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { DatabaseModule } from '../database/database.module';
import { RateLimitGuard } from './rate-limit.guard';
import { ThrottleService } from './throttle.service';
import { ThrottleDomain } from './domain/throttle.domain';
import { ThrottlesRepository } from './repositories/throttles.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [ThrottleService, ThrottleDomain, ThrottlesRepository, RateLimitGuard],
    exports: [ThrottleService, RateLimitGuard]
})
export class ThrottleModule {}
