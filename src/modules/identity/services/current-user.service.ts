import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UnauthorizedError } from '../domain/identity.errors';
import { User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';

@Injectable()
export class CurrentUserService {
    public constructor(
        private readonly userDomain: UserDomain,
        private readonly context: AppContext
    ) {}

    public async require(): Promise<User> {
        const userId: string | undefined = this.context.get().userId;
        const user: User | null = userId ? await this.userDomain.findById(userId) : null;
        if (!user) {
            throw new UnauthorizedError();
        }
        return user;
    }
}
