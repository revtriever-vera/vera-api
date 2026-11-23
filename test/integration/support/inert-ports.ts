import { TestingModuleBuilder } from '@nestjs/testing';
import { AiConsentEraser } from '../../../src/modules/ai-assistant/services/ai-consent.eraser';
import { AiConsentExporter } from '../../../src/modules/ai-assistant/services/ai-consent.exporter';
import { FixedIncomeSampleApplication } from '../../../src/modules/fixed-income/application/fixed-income-sample.application';
import { FixedIncomeAccountExporter } from '../../../src/modules/fixed-income/services/fixed-income-account.exporter';
import { AllocationAccountExporter } from '../../../src/modules/allocation/services/allocation-account.exporter';
import { AllocationTargetSummary } from '../../../src/modules/allocation/services/allocation-target.summary';
import { PortfolioOnboardingSummary } from '../../../src/modules/portfolio/services/portfolio-onboarding.summary';
import { PositionsAccountExporter } from '../../../src/modules/positions/services/positions-account.exporter';
import { SpendingCategoriesAccountExporter } from '../../../src/modules/spending-categories/services/spending-categories-account.exporter';
import { BankConnectionsExporter } from '../../../src/modules/bank-connections/services/bank-connections.exporter';
import { PluggyCredentialsEraser } from '../../../src/modules/bank-connections/services/pluggy-credentials.eraser';
import { BanksOnboardingSummary } from '../../../src/modules/bank-connections/services/banks-onboarding.summary';
import { GoalsSampleDataService } from '../../../src/modules/goals/services/goals-sample-data.service';
import { RecurringAccountExporter } from '../../../src/modules/recurring/services/recurring-account.exporter';
import { RecurringSampleDataService } from '../../../src/modules/recurring/services/recurring-sample-data.service';
import { SpendingSettingsAccountExporter } from '../../../src/modules/spending-summary/services/spending-settings-account.exporter';
import { SpendingSampleDataService } from '../../../src/modules/transactions/services/spending-sample-data.service';
import { TransactionsAccountExporter } from '../../../src/modules/transactions/services/transactions-account.exporter';
import { PositionsSampleDataService } from '../../../src/modules/positions/services/positions-sample-data.service';

export function withoutBusinessPorts(builder: TestingModuleBuilder): TestingModuleBuilder {
    return withoutGoalsPorts(withoutRecurringPorts(withoutSpendingPorts(withoutPortfolioPorts(builder))));
}

function withoutGoalsPorts(builder: TestingModuleBuilder): TestingModuleBuilder {
    return builder.overrideProvider(GoalsSampleDataService).useValue({});
}

function withoutRecurringPorts(builder: TestingModuleBuilder): TestingModuleBuilder {
    return builder.overrideProvider(RecurringAccountExporter).useValue({}).overrideProvider(RecurringSampleDataService).useValue({});
}

function withoutPortfolioPorts(builder: TestingModuleBuilder): TestingModuleBuilder {
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
        .useValue({});
}

function withoutSpendingPorts(builder: TestingModuleBuilder): TestingModuleBuilder {
    return builder
        .overrideProvider(AiConsentEraser)
        .useValue({})
        .overrideProvider(AiConsentExporter)
        .useValue({})
        .overrideProvider(SpendingCategoriesAccountExporter)
        .useValue({})
        .overrideProvider(BankConnectionsExporter)
        .useValue({})
        .overrideProvider(PluggyCredentialsEraser)
        .useValue({})
        .overrideProvider(TransactionsAccountExporter)
        .useValue({})
        .overrideProvider(SpendingSampleDataService)
        .useValue({})
        .overrideProvider(SpendingSettingsAccountExporter)
        .useValue({})
        .overrideProvider(BanksOnboardingSummary)
        .useValue({});
}
