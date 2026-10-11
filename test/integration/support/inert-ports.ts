import { TestingModuleBuilder } from '@nestjs/testing';
import { FixedIncomeSampleApplication } from '../../../src/modules/fixed-income/application/fixed-income-sample.application';
import { FixedIncomeAccountExporter } from '../../../src/modules/fixed-income/services/fixed-income-account.exporter';
import { AllocationAccountExporter } from '../../../src/modules/allocation/services/allocation-account.exporter';
import { AllocationTargetSummary } from '../../../src/modules/allocation/services/allocation-target.summary';
import { PortfolioOnboardingSummary } from '../../../src/modules/portfolio/services/portfolio-onboarding.summary';
import { PositionsAccountExporter } from '../../../src/modules/positions/services/positions-account.exporter';
import { SpendingCategoriesAccountExporter } from '../../../src/modules/spending-categories/services/spending-categories-account.exporter';
import { PositionsSampleDataService } from '../../../src/modules/positions/services/positions-sample-data.service';

export function withoutBusinessPorts(builder: TestingModuleBuilder): TestingModuleBuilder {
    return builder
        .overrideProvider(FixedIncomeSampleApplication)
        .useValue({})
        .overrideProvider(FixedIncomeAccountExporter)
        .useValue({})
        .overrideProvider(AllocationAccountExporter)
        .useValue({})
        .overrideProvider(AllocationTargetSummary)
        .useValue({})
        .overrideProvider(PortfolioOnboardingSummary)
        .useValue({})
        .overrideProvider(PositionsAccountExporter)
        .useValue({})
        .overrideProvider(PositionsSampleDataService)
        .useValue({})
        .overrideProvider(SpendingCategoriesAccountExporter)
        .useValue({});
}
