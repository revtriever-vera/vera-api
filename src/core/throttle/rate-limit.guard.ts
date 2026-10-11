import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppContext } from '../context/app-context.port';
import { RATE_LIMIT_KEY, RateLimitOptions, RateLimitSubject } from './rate-limit.decorator';
import { ThrottleService } from './throttle.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
    public constructor(
        private readonly reflector: Reflector,
        private readonly throttle: ThrottleService,
        private readonly context: AppContext
    ) {}

    public canActivate(executionContext: ExecutionContext): Promise<boolean> {
        return this.enforce(executionContext).then((): boolean => true);
    }

    private async enforce(executionContext: ExecutionContext): Promise<void> {
        const options: RateLimitOptions | undefined = this.reflector.get<RateLimitOptions | undefined>(
            RATE_LIMIT_KEY,
            executionContext.getHandler()
        );
        if (!options) {
            return;
        }
        const request: Request = executionContext.switchToHttp().getRequest<Request>();
        const subject: RateLimitSubject = {
            body: (request.body ?? {}) as Readonly<Record<string, unknown>>,
            params: request.params as Readonly<Record<string, string>>,
            ip: request.ip ?? '',
            companyId: this.context.getOrNull()?.companyId
        };
        const identity: string | null = options.identify(subject);
        if (!identity) {
            return;
        }
        await this.throttle.assertAllowed(`${options.key}:${identity}`, options.limit, options.windowSeconds);
    }
}
