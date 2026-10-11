import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { CompaniesRepository } from './companies.repository';
import { SessionsRepository } from './sessions.repository';
import { UsersRepository } from './users.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [CompaniesRepository, UsersRepository, SessionsRepository],
    exports: [CompaniesRepository, UsersRepository, SessionsRepository]
})
export class IdentityRepositoryModule {}
