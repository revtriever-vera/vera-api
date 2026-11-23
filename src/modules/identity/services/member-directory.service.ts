import { Injectable } from '@nestjs/common';
import { InvalidHolderError } from '../domain/members.errors';
import { User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';

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

    public async requireActive(userId: string): Promise<DirectoryMember> {
        const user: User | null = await this.users.findById(userId);
        if (user === null) {
            throw new InvalidHolderError();
        }
        return { userId: user.id, name: user.name };
    }
}
