import { Module } from '@nestjs/common';
import { AllocationRepositoryModule } from '../repositories/allocation-repository.module';
import { AssetClassDomain } from './asset-class.domain';
import { ClassAssignmentDomain } from './class-assignment.domain';

@Module({
    imports: [AllocationRepositoryModule],
    providers: [AssetClassDomain, ClassAssignmentDomain],
    exports: [AssetClassDomain, ClassAssignmentDomain]
})
export class AllocationDomainModule {}
