import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { ClassSummary, PortfolioSnapshot } from '../domain/portfolio.types';
import { PortfolioClassNotFoundError } from '../domain/portfolio.errors';
import { PortfolioMetricsService } from '../services/portfolio-metrics.service';
import { PortfolioSnapshotService } from '../services/portfolio-snapshot.service';
import {
    HolderNames,
    holderNamesOf,
    toClassDetailResponse,
    toHoldingsResponse,
    toOverviewResponse
} from '../services/portfolio-view.mapper';
import { ClassDetailResponse, HoldingsResponse, OverviewResponse } from '../validation/portfolio.schemas';

@Injectable()
export class PortfolioViewApplication {
    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly members: MemberDirectoryService,
        private readonly metrics: PortfolioMetricsService
    ) {}

    public async holdings(filter: HolderFilter): Promise<HoldingsResponse> {
        this.metrics.holderFilter(filter.kind);
        return toHoldingsResponse(await this.snapshots.build(filter), await this.holderNames());
    }

    public async overview(filter: HolderFilter): Promise<OverviewResponse> {
        this.metrics.holderFilter(filter.kind);
        return toOverviewResponse(await this.snapshots.build(filter));
    }

    public async classDetail(classId: string, filter: HolderFilter): Promise<ClassDetailResponse> {
        this.metrics.holderFilter(filter.kind);
        const snapshot: PortfolioSnapshot = await this.snapshots.build(filter);
        const found: ClassSummary | undefined = snapshot.classes.find((item: ClassSummary): boolean => item.classId === classId);
        if (found === undefined) {
            throw new PortfolioClassNotFoundError(classId);
        }
        return toClassDetailResponse(snapshot, found, await this.holderNames());
    }

    private async holderNames(): Promise<HolderNames> {
        return holderNamesOf(await this.members.list());
    }
}
