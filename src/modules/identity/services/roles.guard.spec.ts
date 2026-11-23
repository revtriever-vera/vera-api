import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RoleForbiddenError, RouteRoleMissingError, UnauthorizedError } from '../domain/identity.errors';
import { User, UserRole } from '../domain/identity.types';
import { CurrentUserService } from './current-user.service';
import { IdentityLogService } from './identity-log.service';
import { IdentityMetricsService } from './identity-metrics.service';
import { RolesGuard } from './roles.guard';

function executionOf(method: string): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => ({ method, path: '/positions', route: { path: '/positions' } }) }),
        getHandler: () => 'handler',
        getClass: () => 'class'
    } as unknown as ExecutionContext;
}

function build(role: string | null, declared: UserRole | undefined) {
    const require: ReturnType<typeof vi.fn> = vi.fn();
    if (role === null) {
        require.mockRejectedValue(new UnauthorizedError());
    } else {
        require.mockResolvedValue({ id: 'user-1', role } as User);
    }
    const roleDenied: ReturnType<typeof vi.fn> = vi.fn();
    const routeRoleMissing: ReturnType<typeof vi.fn> = vi.fn();
    const authzDenied: ReturnType<typeof vi.fn> = vi.fn();
    const guard: RolesGuard = new RolesGuard(
        { getAllAndOverride: vi.fn().mockReturnValue(declared) } as unknown as Reflector,
        { require } as unknown as CurrentUserService,
        { roleDenied, routeRoleMissing } as unknown as IdentityLogService,
        { authzDenied } as unknown as IdentityMetricsService
    );
    return { guard, roleDenied, routeRoleMissing, authzDenied };
}

describe('RolesGuard', () => {
    it.each(['owner', 'editor', 'viewer'])('GET sem papel declarado passa para %s', async (role: string) => {
        await expect(build(role, undefined).guard.canActivate(executionOf('GET'))).resolves.toBe(true);
    });

    it('POST sem papel declarado lança erro de configuração e loga como erro', async () => {
        const { guard, routeRoleMissing } = build('owner', undefined);

        await expect(guard.canActivate(executionOf('POST'))).rejects.toBeInstanceOf(RouteRoleMissingError);
        expect(routeRoleMissing).toHaveBeenCalledWith('POST /positions');
    });

    it('editor recusa viewer, e aceita editor e owner', async () => {
        await expect(build('viewer', 'editor').guard.canActivate(executionOf('POST'))).rejects.toBeInstanceOf(RoleForbiddenError);
        await expect(build('editor', 'editor').guard.canActivate(executionOf('POST'))).resolves.toBe(true);
        await expect(build('owner', 'editor').guard.canActivate(executionOf('POST'))).resolves.toBe(true);
    });

    it('owner recusa editor, registra o log e a métrica da recusa', async () => {
        const { guard, roleDenied, authzDenied } = build('editor', 'owner');

        await expect(guard.canActivate(executionOf('DELETE'))).rejects.toMatchObject({ code: 'members.forbidden_role', meta: { required: 'owner' } });
        expect(roleDenied).toHaveBeenCalledWith('DELETE /positions', 'owner', 'editor');
        expect(authzDenied).toHaveBeenCalledWith('owner');
    });

    it('o papel declarado vale também para GET', async () => {
        await expect(build('editor', 'owner').guard.canActivate(executionOf('GET'))).rejects.toBeInstanceOf(RoleForbiddenError);
    });

    it('usuário apagado dá 401', async () => {
        await expect(build(null, 'viewer').guard.canActivate(executionOf('GET'))).rejects.toBeInstanceOf(UnauthorizedError);
    });
});
