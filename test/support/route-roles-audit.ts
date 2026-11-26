import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../src/modules/identity/services/jwt-auth.guard';
import { REQUIRED_ROLE_KEY } from '../../src/modules/identity/services/requires-role.decorator';
import { PlatformGuard } from '../../src/modules/identity/services/platform.guard';
import { RolesGuard } from '../../src/modules/identity/services/roles.guard';

export interface RouteRole {
    readonly route: string;
    readonly method: string;
    readonly sessioned: boolean;
    readonly rolesGuarded: boolean;
    readonly platformGuarded: boolean;
    readonly role: string | undefined;
}

export const VIEWER_WRITE_ALLOWLIST: readonly string[] = [
    'POST /portfolio/contributions/suggest',
    'POST /portfolio/fgc/simulate',
    'PATCH /auth/me/preferences',
    'PATCH /notifications/preferences',
    'POST /members/me/leave',
    'POST /whatsapp/link/code',
    'DELETE /whatsapp/link',
    'DELETE /reminders/:id',
    'DELETE /calendar/connection',
    'PUT /spending/recurring/:id/notice-before',
    'POST /assistant/turns',
    'POST /assistant/turns/:id/feedback',
    'DELETE /assistant/conversations/:id'
];

const READ_METHODS: readonly string[] = ['GET', 'HEAD'];

type Target = object;

function guardsOf(target: Target): readonly unknown[] {
    return (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? [];
}

function join(prefix: string, path: string): string {
    return `/${[prefix, path]
        .map((part: string): string => part.replace(/^\/+|\/+$/g, ''))
        .filter((part: string): boolean => part.length > 0)
        .join('/')}`;
}

function guardFlags(guards: readonly unknown[]): Pick<RouteRole, 'sessioned' | 'rolesGuarded' | 'platformGuarded'> {
    return {
        sessioned: guards.includes(JwtAuthGuard),
        rolesGuarded: guards.includes(RolesGuard),
        platformGuarded: guards.includes(PlatformGuard)
    };
}

function routeOf(controller: new (...args: never[]) => unknown, prefix: string, name: string): RouteRole | null {
    const handler: Target = (controller.prototype as Record<string, Target>)[name] as Target;
    const verb: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    if (verb === undefined) {
        return null;
    }
    const path: string = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
    const method: string = RequestMethod[verb];
    return {
        route: `${method} ${join(prefix, path)}`,
        method,
        ...guardFlags([...guardsOf(controller), ...guardsOf(handler)]),
        role: (Reflect.getMetadata(REQUIRED_ROLE_KEY, handler) ?? Reflect.getMetadata(REQUIRED_ROLE_KEY, controller)) as string | undefined
    };
}

export function routesOf(controllers: readonly (new (...args: never[]) => unknown)[]): RouteRole[] {
    return controllers.flatMap((controller): RouteRole[] => {
        const prefix: string = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
        return Object.getOwnPropertyNames(controller.prototype)
            .filter((name: string): boolean => name !== 'constructor')
            .map((name: string): RouteRole | null => routeOf(controller, prefix, name))
            .filter((route: RouteRole | null): route is RouteRole => route !== null);
    });
}

export function violationsOf(routes: readonly RouteRole[]): string[] {
    return routes.flatMap((route: RouteRole): string[] => {
        if (!route.sessioned || route.platformGuarded) {
            return [];
        }
        const isWrite: boolean = !READ_METHODS.includes(route.method);
        if (!route.rolesGuarded) {
            return [`${route.route}: protected by session but without RolesGuard`];
        }
        if (isWrite && route.role === undefined) {
            return [`${route.route}: write route without @RequiresRole`];
        }
        if (isWrite && route.role === 'viewer' && !VIEWER_WRITE_ALLOWLIST.includes(route.route)) {
            return [`${route.route}: write route declared as viewer outside the allowlist`];
        }
        return [];
    });
}
