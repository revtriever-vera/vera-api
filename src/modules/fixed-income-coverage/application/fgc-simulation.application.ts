import { Injectable } from '@nestjs/common';
import { FGC_ENDPOINTS } from '../domain/fgc.types';
import { FgcCoverageService } from '../services/fgc-coverage.service';
import { FgcMetricsService } from '../services/fgc-metrics.service';
import { FgcSimulateBodyDto, FgcSimulateResponse } from '../validation/fgc.schemas';

@Injectable()
export class FgcSimulationApplication {
    public constructor(
        private readonly coverageService: FgcCoverageService,
        private readonly metrics: FgcMetricsService
    ) {}

    public async simulate(body: FgcSimulateBodyDto): Promise<FgcSimulateResponse> {
        this.metrics.request(FGC_ENDPOINTS.simulate);
        return this.coverageService.simulate(body);
    }
}
