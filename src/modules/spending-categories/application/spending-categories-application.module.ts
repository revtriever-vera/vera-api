import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { SpendingCategoriesDomainModule } from '../domain/spending-categories-domain.module';
import { CategoryReaderService } from '../services/category-reader.service';
import { CategoryRuleService } from '../services/category-rule.service';
import { DescriptionNormalizerService } from '../services/description-normalizer.service';
import { RecategorizationRegistry } from '../services/recategorization.registry';
import { SpendingCategoriesAccountExporter } from '../services/spending-categories-account.exporter';
import { SpendingCategoriesLogService } from '../services/spending-categories-log.service';
import { SpendingCategoriesMetricsService } from '../services/spending-categories-metrics.service';
import { TransactionCategorizerService } from '../services/transaction-categorizer.service';
import { CategoryApplication } from './category.application';
import { RuleApplication } from './rule.application';

@Module({
    imports: [SpendingCategoriesDomainModule, ContextModule, ObservabilityModule, DiscoveryModule],
    providers: [
        CategoryApplication,
        RuleApplication,
        SpendingCategoriesLogService,
        SpendingCategoriesMetricsService,
        SpendingCategoriesAccountExporter,
        RecategorizationRegistry,
        CategoryReaderService,
        CategoryRuleService,
        DescriptionNormalizerService,
        TransactionCategorizerService
    ],
    exports: [
        CategoryApplication,
        RuleApplication,
        CategoryReaderService,
        CategoryRuleService,
        DescriptionNormalizerService,
        TransactionCategorizerService
    ]
})
export class SpendingCategoriesApplicationModule {}
