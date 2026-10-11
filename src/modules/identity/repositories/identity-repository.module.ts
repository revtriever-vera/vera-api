import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AuthIdentitiesRepository } from './auth-identities.repository';
import { CompaniesRepository } from './companies.repository';
import { SessionsRepository } from './sessions.repository';
import { UsersRepository } from './users.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [CompaniesRepository, UsersRepository, SessionsRepository, AuthIdentitiesRepository],
    exports: [CompaniesRepository, UsersRepository, SessionsRepository, AuthIdentitiesRepository]
})
export class IdentityRepositoryModule {}
