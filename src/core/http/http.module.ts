import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { ObservabilityModule } from '../observability/observability.module';
import { AppErrorFilter } from './app-error.filter';

@Module({
    imports: [ContextModule, ObservabilityModule],
    providers: [AppErrorFilter],
    exports: [AppErrorFilter]
})
export class HttpModule {}
