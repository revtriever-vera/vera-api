import { Module } from '@nestjs/common';
import { UsageRepositoryModule } from '../repositories/usage-repository.module';
import { PaidUsageEntryDomain } from './paid-usage-entry.domain';
import { PaidUsageNoticeDomain } from './paid-usage-notice.domain';

@Module({
    imports: [UsageRepositoryModule],
    providers: [PaidUsageEntryDomain, PaidUsageNoticeDomain],
    exports: [PaidUsageEntryDomain, PaidUsageNoticeDomain]
})
export class UsageDomainModule {}
