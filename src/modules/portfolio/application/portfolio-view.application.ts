import { Injectable } from '@nestjs/common';
import { ClassSummary, PortfolioSnapshot } from '../domain/portfolio.types';
import { PortfolioClassNotFoundError } from '../domain/portfolio.errors';
import { PortfolioSnapshotService } from '../services/portfolio-snapshot.service';
import { toClassDetailResponse, toHoldingsResponse, toOverviewResponse } from '../services/portfolio-view.mapper';
import { ClassDetailResponse, HoldingsResponse, OverviewResponse } from '../validation/portfolio.schemas';

@Injectable()
export class PortfolioViewApplication {
    public constructor(private readonly snapshots: PortfolioSnapshotService) {}

    public async holdings(): Promise<HoldingsResponse> {
        return toHoldingsResponse(await this.snapshots.build());
    }

    public async overview(): Promise<OverviewResponse> {
        return toOverviewResponse(await this.snapshots.build());
    }

    public async classDetail(classId: string): Promise<ClassDetailResponse> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build();
        const found: ClassSummary | undefined = snapshot.classes.find((item: ClassSummary): boolean => item.classId === classId);
        if (found === undefined) {
            throw new PortfolioClassNotFoundError(classId);
        }
        return toClassDetailResponse(snapshot, found);
    }
}
