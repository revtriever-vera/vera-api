import { Injectable } from '@nestjs/common';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { AssetClass, CLASS_ACTIONS } from '../domain/allocation.types';
import { AllocationLogService } from './allocation-log.service';
import { AllocationMetricsService } from './allocation-metrics.service';

export type { AssetClass };

@Injectable()
export class ClassReaderService {
    public constructor(
        private readonly classes: AssetClassDomain,
        private readonly logs: AllocationLogService,
        private readonly metrics: AllocationMetricsService
    ) {}

    public async listForCompany(): Promise<readonly AssetClass[]> {
        const seeded: AssetClass[] = await this.classes.ensureDefaults();
        if (seeded.length > 0) {
            this.logs.defaultsSeeded(seeded.length);
            this.metrics.classAction(CLASS_ACTIONS.seeded, seeded.length);
        }
        return this.classes.listActive();
    }
}
