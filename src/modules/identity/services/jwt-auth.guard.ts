import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppContext } from '../../../core/context/app-context.port';
import { UnauthorizedError } from '../domain/identity.errors';
import { TokenClaims, TokenService } from './token.service';

const BEARER_PREFIX: string = 'Bearer ';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    public constructor(
        private readonly tokens: TokenService,
        private readonly context: AppContext
    ) {}

    public canActivate(executionContext: ExecutionContext): boolean {
        const request: Request = executionContext.switchToHttp().getRequest<Request>();
        const header: string | undefined = request.headers.authorization;
        const token: string | undefined = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;
        const claims: TokenClaims | null = token ? this.tokens.verifyAccessToken(token) : null;
        if (!claims) {
            throw new UnauthorizedError();
        }
        this.context.enrich({
            userId: claims.sub,
            companyId: claims.companyId,
            sessionId: claims.sessionId,
            locale: claims.locale
        });
        return true;
    }
}
