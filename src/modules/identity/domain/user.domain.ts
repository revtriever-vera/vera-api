import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { USER_ROLES, User, UserRole } from './identity.types';

export interface CreateMemberInput extends CreateOwnerInput {
    readonly role: UserRole;
}

export interface CreateOwnerInput {
    readonly email: string;
    readonly name: string;
    readonly emailVerifiedAt: Date | null;
    readonly termsAcceptedAt: Date | null;
}

@Injectable()
export class UserDomain {
    public constructor(private readonly users: UsersRepository) {}

    public async createOwner(input: CreateOwnerInput): Promise<User> {
        return this.users.create({
            email: input.email.toLowerCase(),
            name: input.name,
            role: USER_ROLES.owner,
            emailVerifiedAt: input.emailVerifiedAt,
            termsAcceptedAt: input.termsAcceptedAt
        });
    }

    public async createMember(input: CreateMemberInput): Promise<User> {
        return this.users.create({
            email: input.email.toLowerCase(),
            name: input.name,
            role: input.role,
            emailVerifiedAt: input.emailVerifiedAt,
            termsAcceptedAt: input.termsAcceptedAt
        });
    }

    public async findRemovedToAnonymize(cutoff: Date, batch: number): Promise<User[]> {
        return this.users.findRemovedToAnonymize(cutoff, batch);
    }

    public async anonymize(userId: string): Promise<void> {
        await this.users.anonymize(userId);
    }

    public async findByIdAcrossTenants(id: string): Promise<User | null> {
        return this.users.findByIdAcrossTenants(id);
    }

    public async findManyByIdsAcrossTenants(ids: readonly string[]): Promise<User[]> {
        return this.users.findManyByIdsAcrossTenants(ids);
    }

    public async findByEmail(email: string): Promise<User | null> {
        return this.users.findByEmail(email.toLowerCase());
    }

    public async listMembers(): Promise<User[]> {
        return this.users.listMembers();
    }

    public async lockMembers(): Promise<User[]> {
        return this.users.lockMembers();
    }

    public async changeRole(userId: string, role: UserRole): Promise<User | null> {
        return this.users.updateRole(userId, role);
    }

    public async markRemoved(userId: string, removedByUserId: string): Promise<void> {
        await this.users.markRemoved(userId, removedByUserId, new Date());
    }

    public async findById(id: string): Promise<User | null> {
        return this.users.findById(id);
    }

    public async findByEmailAcrossTenants(email: string): Promise<User | null> {
        return this.users.findByEmailAcrossTenants(email.toLowerCase());
    }

    public async updatePersonalLocale(userId: string, locale: string | null): Promise<User | null> {
        return this.users.updatePersonalLocale(userId, locale);
    }
}
