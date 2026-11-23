import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RoleForbiddenError, RouteRoleMissingError } from '../domain/identity.errors';
import { USER_ROLES, User, UserRole } from '../domain/identity.types';
import { CurrentUserService } from './current-user.service';
import { IdentityLogService } from './identity-log.service';
import { IdentityMetricsService } from './identity-metrics.service';
import { REQUIRED_ROLE_KEY } from './requires-role.decorator';
import { hasRole } from './role-rank';

const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

@Injectable()
export class RolesGuard implements CanActivate {
    public constructor(
        private readonly reflector: Reflector,
        private readonly currentUser: CurrentUserService,
        private readonly logs: IdentityLogService,
        private readonly metrics: IdentityMetricsService
    ) {}

    public async canActivate(executionContext: ExecutionContext): Promise<boolean> {
        const request: Request = executionContext.switchToHttp().getRequest<Request>();
        const route: string = `${request.method} ${(request.route as { path?: string } | undefined)?.path ?? request.path}`;
        const required: UserRole = this.requiredRole(executionContext, request, route);
        const user: User = await this.currentUser.require();
        if (!hasRole(user.role, required)) {
            this.logs.roleDenied(route, required, user.role);
            this.metrics.authzDenied(required);
            throw new RoleForbiddenError(required);
        }
        return true;
    }

    private requiredRole(executionContext: ExecutionContext, request: Request, route: string): UserRole {
        const declared: UserRole | undefined = this.reflector.getAllAndOverride<UserRole | undefined>(REQUIRED_ROLE_KEY, [
            executionContext.getHandler(),
            executionContext.getClass()
        ]);
        if (declared) {
            return declared;
        }
        if (READ_METHODS.has(request.method)) {
            return USER_ROLES.viewer;
        }
        this.logs.routeRoleMissing(route);
        throw new RouteRoleMissingError(route);
    }
}
