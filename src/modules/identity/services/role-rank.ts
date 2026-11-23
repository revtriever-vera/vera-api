import { ROLE_RANK, UserRole } from '../domain/identity.types';

export function hasRole(actual: string, required: UserRole): boolean {
    const rank: number | undefined = (ROLE_RANK as Readonly<Record<string, number>>)[actual];
    return rank !== undefined && rank >= ROLE_RANK[required];
}
