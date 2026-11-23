import { Injectable } from '@nestjs/common';
import { FgcHolderNotSupportedError } from '../domain/fgc.errors';
import { FGC_ENDPOINTS, FgcCoverage, FgcGroup } from '../domain/fgc.types';
import { FgcCoverageService } from '../services/fgc-coverage.service';
import { FgcLogService } from '../services/fgc-log.service';
import { FgcMetricsService } from '../services/fgc-metrics.service';
import { FgcQueryDto, FgcResponse } from '../validation/fgc.schemas';

@Injectable()
export class FgcCoverageApplication {
    public constructor(
        private readonly coverageService: FgcCoverageService,
        private readonly logs: FgcLogService,
        private readonly metrics: FgcMetricsService
    ) {}

    public async get(query: FgcQueryDto): Promise<FgcResponse> {
        if (query.holderId !== undefined) {
            throw new FgcHolderNotSupportedError();
        }
        const coverage: FgcCoverage = await this.coverageService.coverage();
        const overGroups: number = coverage.groups.filter((group: FgcGroup): boolean => group.overMinor > 0).length;
        this.metrics.request(FGC_ENDPOINTS.coverage);
        this.metrics.overLimitGroups(overGroups);
        this.logs.computed(coverage.groups.length, overGroups, coverage.outside.length);
        return coverage as FgcResponse;
    }
}
