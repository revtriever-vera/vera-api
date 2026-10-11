import { Module, OnModuleInit } from '@nestjs/common';
import { AlsAppContext } from './als-app-context';
import { AppContext } from './app-context.port';
import { ContextHolder } from './as-company.decorator';
import { RequestContextMiddleware } from './request-context.middleware';

@Module({
    providers: [{ provide: AppContext, useClass: AlsAppContext }, RequestContextMiddleware],
    exports: [AppContext, RequestContextMiddleware]
})
export class ContextModule implements OnModuleInit {
    public constructor(private readonly context: AppContext) {}

    public onModuleInit(): void {
        ContextHolder.set(this.context);
    }
}
