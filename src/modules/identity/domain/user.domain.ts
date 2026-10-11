import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { USER_ROLES, User } from './identity.types';

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
