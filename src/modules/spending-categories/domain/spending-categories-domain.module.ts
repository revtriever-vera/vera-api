import { Module } from '@nestjs/common';
import { SpendingCategoriesRepositoryModule } from '../repositories/spending-categories-repository.module';
import { CategoryRuleDomain } from './category-rule.domain';
import { SpendingCategoryDomain } from './spending-category.domain';

@Module({
    imports: [SpendingCategoriesRepositoryModule],
    providers: [SpendingCategoryDomain, CategoryRuleDomain],
    exports: [SpendingCategoryDomain, CategoryRuleDomain]
})
export class SpendingCategoriesDomainModule {}
