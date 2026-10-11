import { Injectable } from '@nestjs/common';
import { OnboardingArea, OnboardingAreaSummary, OnboardingAreaSummaryPort } from '../../onboarding/services/onboarding-area-summary.port';
import { Holding, PortfolioSnapshot, PortfolioSnapshotService } from './portfolio-snapshot.service';

@Injectable()
export class PortfolioOnboardingSummary extends OnboardingAreaSummaryPort {
    public readonly area: OnboardingArea = 'assets';

    public constructor(private readonly snapshots: PortfolioSnapshotService) {
        super();
    }

    public async summarize(): Promise<OnboardingAreaSummary> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build();
        const items: number = snapshot.holdings.filter((holding: Holding): boolean => !holding.isZeroQuantity).length;
        return { items, amountCents: snapshot.totalMinor, currency: snapshot.baseCurrency };
    }
}
