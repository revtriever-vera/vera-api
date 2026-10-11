import { AppError } from '../../shared/errors/app.error';

export class MissingTenantContextError extends AppError {
    public constructor(table: string) {
        super({
            code: 'core.missing_tenant_context',
            status: 500,
            detail: `TenantRepository accessed for table "${table}" outside of a tenant AppContext.run scope.`,
            meta: { table }
        });
    }
}

const POSTGRES_UNIQUE_VIOLATION: string = '23505';

export function isUniqueViolationError(error: unknown, constraint?: string): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const candidate: { code?: unknown; constraint?: unknown } = error;
    if (candidate.code !== POSTGRES_UNIQUE_VIOLATION) {
        return false;
    }
    return constraint === undefined || candidate.constraint === constraint;
}
