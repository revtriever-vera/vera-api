import { Injectable } from '@nestjs/common';
import { HolderFilter, holderFilterOf } from '../../../shared/holder/holder-filter';
import { DirectoryMember, MemberDirectoryService } from '../../identity/services/member-directory.service';
import { FGC_ENDPOINTS, FgcCoverage, FgcGroup, FgcHolderBlock } from '../domain/fgc.types';
import { FgcCoverageService } from '../services/fgc-coverage.service';
import { FgcLogService } from '../services/fgc-log.service';
import { FgcMetricsService } from '../services/fgc-metrics.service';
import { toFgcResponse } from '../services/fgc-response.mapper';
import { FgcQueryDto, FgcResponse } from '../validation/fgc.schemas';

@Injectable()
export class FgcCoverageApplication {
    public constructor(
        private readonly coverageService: FgcCoverageService,
        private readonly members: MemberDirectoryService,
        private readonly logs: FgcLogService,
        private readonly metrics: FgcMetricsService
    ) {}

    public async get(query: FgcQueryDto): Promise<FgcResponse> {
        const filter: HolderFilter = holderFilterOf(query.holder);
        const coverage: FgcCoverage = await this.coverageService.coverage(filter);
        const groups: FgcGroup[] = coverage.blocks.flatMap((block: FgcHolderBlock): readonly FgcGroup[] => block.groups);
        const outside: number = coverage.blocks.reduce((sum: number, block: FgcHolderBlock): number => sum + block.outside.length, 0);
        const overGroups: number = groups.filter((group: FgcGroup): boolean => group.overMinor > 0).length;
        this.metrics.request(FGC_ENDPOINTS.coverage);
        this.metrics.overLimitGroups(overGroups);
        this.logs.computed(groups.length, overGroups, outside);
        const members: DirectoryMember[] = await this.members.list();
        return toFgcResponse(coverage, filter, members);
    }
}
