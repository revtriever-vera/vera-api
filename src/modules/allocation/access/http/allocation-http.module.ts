import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { AllocationApplicationModule } from '../../application/allocation-application.module';
import { AssetClassesController } from './asset-classes.controller';
import { ClassAssignmentsController } from './class-assignments.controller';
import { ClassTargetsController } from './class-targets.controller';
import { AllocationSettingsController } from './portfolio-settings.controller';

@Module({
    imports: [AllocationApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [AssetClassesController, ClassAssignmentsController, ClassTargetsController, AllocationSettingsController]
})
export class AllocationHttpModule {}
