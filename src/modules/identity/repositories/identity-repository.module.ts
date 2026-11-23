import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AccountInvitesRepository } from './account-invites.repository';
import { AccountDeletionLogRepository } from './account-deletion-log.repository';
import { AuthIdentitiesRepository } from './auth-identities.repository';
import { CompaniesRepository } from './companies.repository';
import { PlatformAuditLogRepository } from './platform-audit-log.repository';
import { SessionsRepository } from './sessions.repository';
import { UserRecoveryCodesRepository } from './user-recovery-codes.repository';
import { UserTotpsRepository } from './user-totps.repository';
import { UsersRepository } from './users.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [
        CompaniesRepository,
        UsersRepository,
        SessionsRepository,
        AuthIdentitiesRepository,
        AccountDeletionLogRepository,
        AccountInvitesRepository,
        PlatformAuditLogRepository,
        UserTotpsRepository,
        UserRecoveryCodesRepository
    ],
    exports: [
        CompaniesRepository,
        UsersRepository,
        SessionsRepository,
        AuthIdentitiesRepository,
        AccountDeletionLogRepository,
        AccountInvitesRepository,
        PlatformAuditLogRepository,
        UserTotpsRepository,
        UserRecoveryCodesRepository
    ]
})
export class IdentityRepositoryModule {}
