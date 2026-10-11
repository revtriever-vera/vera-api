import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { SpendingCategoriesApplicationModule } from '../../application/spending-categories-application.module';
import { CategoriesController } from './categories.controller';
import { RulesController } from './rules.controller';

@Module({
    imports: [SpendingCategoriesApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [CategoriesController, RulesController]
})
export class SpendingCategoriesHttpModule {}
