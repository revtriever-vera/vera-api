import { LastOwnerError } from './members.errors';
import { USER_ROLES, UserRole } from './identity.types';

export interface RoleHolder {
    readonly id: string;
    readonly role: string;
}

export function assertKeepsOwner(members: readonly RoleHolder[], userId: string, nextRole: UserRole | null): void {
    const target: RoleHolder | undefined = members.find((member: RoleHolder): boolean => member.id === userId);
    if (target?.role !== USER_ROLES.owner || nextRole === USER_ROLES.owner) {
        return;
    }
    const remaining: number = members.filter(
        (member: RoleHolder): boolean => member.id !== userId && member.role === USER_ROLES.owner
    ).length;
    if (remaining === 0) {
        throw new LastOwnerError();
    }
}
