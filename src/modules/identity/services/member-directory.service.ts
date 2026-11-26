import { Injectable } from '@nestjs/common';
import { InvalidHolderError } from '../domain/members.errors';
import { USER_ROLES, User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { hasRole } from './role-rank';

export { InvalidHolderError };

export interface DirectoryMember {
    readonly userId: string;
    readonly name: string;
}

@Injectable()
export class MemberDirectoryService {
    public constructor(private readonly users: UserDomain) {}

    public async list(): Promise<DirectoryMember[]> {
        return (await this.users.listMembers()).map((user: User): DirectoryMember => ({ userId: user.id, name: user.name }));
    }

    public async canEdit(userId: string): Promise<boolean> {
        const user: User | null = await this.users.findById(userId);
        return user !== null && hasRole(user.role, USER_ROLES.editor);
    }

    public async requireActive(userId: string): Promise<DirectoryMember> {
        const user: User | null = await this.users.findById(userId);
        if (user === null) {
            throw new InvalidHolderError();
        }
        return { userId: user.id, name: user.name };
    }
}
