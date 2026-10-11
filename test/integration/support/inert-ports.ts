import { TestingModuleBuilder } from '@nestjs/testing';
import { FixedIncomeSampleApplication } from '../../../src/modules/fixed-income/application/fixed-income-sample.application';
import { FixedIncomeAccountExporter } from '../../../src/modules/fixed-income/services/fixed-income-account.exporter';
import { AllocationAccountExporter } from '../../../src/modules/allocation/services/allocation-account.exporter';
import { AllocationTargetSummary } from '../../../src/modules/allocation/services/allocation-target.summary';
import { PositionsAccountExporter } from '../../../src/modules/positions/services/positions-account.exporter';
import { PositionsOnboardingSummary } from '../../../src/modules/positions/services/positions-onboarding.summary';
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
        .overrideProvider(PositionsAccountExporter)
        .useValue({})
        .overrideProvider(PositionsOnboardingSummary)
        .useValue({})
        .overrideProvider(PositionsSampleDataService)
        .useValue({});
}
