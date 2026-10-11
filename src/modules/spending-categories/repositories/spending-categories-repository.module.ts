import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { CategoryRulesRepository } from './category-rules.repository';
import { SpendingCategoriesRepository } from './spending-categories.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [SpendingCategoriesRepository, CategoryRulesRepository],
    exports: [SpendingCategoriesRepository, CategoryRulesRepository]
})
export class SpendingCategoriesRepositoryModule {}
