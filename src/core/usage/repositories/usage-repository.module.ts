import { Module, Type } from '@nestjs/common';
import { ContextModule } from '../../context/context.module';
import { DatabaseModule } from '../../database/database.module';
import { PaidUsageEntriesRepository } from './paid-usage-entries.repository';
import { PaidUsageNoticesRepository } from './paid-usage-notices.repository';

const REPOSITORIES: Type[] = [PaidUsageEntriesRepository, PaidUsageNoticesRepository];

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: REPOSITORIES,
    exports: REPOSITORIES
})
export class UsageRepositoryModule {}
