import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { UnauthorizedError } from '../domain/identity.errors';
import { PlatformEnabledGuard } from './platform-enabled.guard';
import { PlatformTokenCaller, PlatformTokenService } from './platform-token.service';

const BEARER_PREFIX: string = 'Bearer ';
const CALLER_KEY: unique symbol = Symbol('platformTokenCaller');

export function platformCallerOf(request: Request): PlatformTokenCaller {
    const caller: unknown = Reflect.get(request, CALLER_KEY);
    if (caller === undefined) {
        throw new UnauthorizedError();
    }
    return caller as PlatformTokenCaller;
}

@Injectable()
export class PlatformTokenGuard implements CanActivate {
    public constructor(
        private readonly enabled: PlatformEnabledGuard,
        private readonly tokens: PlatformTokenService
    ) {}

    public async canActivate(executionContext: ExecutionContext): Promise<boolean> {
        this.enabled.canActivate();
        const request: Request = executionContext.switchToHttp().getRequest<Request>();
        const header: string | undefined = request.headers.authorization;
        if (!header?.startsWith(BEARER_PREFIX)) {
            throw new UnauthorizedError();
        }
        Reflect.set(request, CALLER_KEY, await this.tokens.authenticate(header.slice(BEARER_PREFIX.length)));
        return true;
    }
}
