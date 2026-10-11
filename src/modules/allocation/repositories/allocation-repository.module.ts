import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AssetClassesRepository } from './asset-classes.repository';
import { ClassAssignmentsRepository } from './class-assignments.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [AssetClassesRepository, ClassAssignmentsRepository],
    exports: [AssetClassesRepository, ClassAssignmentsRepository]
})
export class AllocationRepositoryModule {}
