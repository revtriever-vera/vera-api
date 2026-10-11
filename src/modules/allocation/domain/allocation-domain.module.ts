import { Module } from '@nestjs/common';
import { AllocationRepositoryModule } from '../repositories/allocation-repository.module';
import { AssetClassDomain } from './asset-class.domain';
import { ClassAssignmentDomain } from './class-assignment.domain';
import { PortfolioSettingsDomain } from './portfolio-settings.domain';

@Module({
    imports: [AllocationRepositoryModule],
    providers: [AssetClassDomain, ClassAssignmentDomain, PortfolioSettingsDomain],
    exports: [AssetClassDomain, ClassAssignmentDomain, PortfolioSettingsDomain]
})
export class AllocationDomainModule {}
