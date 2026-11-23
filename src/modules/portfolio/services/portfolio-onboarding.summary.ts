import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { OnboardingArea, OnboardingAreaSummary, OnboardingAreaSummaryPort } from '../../onboarding/services/onboarding-area-summary.port';
import { Holding, PortfolioSnapshot, PortfolioSnapshotService } from './portfolio-snapshot.service';

@Injectable()
export class PortfolioOnboardingSummary extends OnboardingAreaSummaryPort {
    public readonly area: OnboardingArea = 'assets';

    public constructor(private readonly snapshots: PortfolioSnapshotService) {
        super();
    }

    @AsCompany()
    public async summarize(_companyId: string): Promise<OnboardingAreaSummary> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build(ANY_HOLDER);
        const real: Holding[] = snapshot.holdings.filter((holding: Holding): boolean => !holding.isSample && !holding.isZeroQuantity);
        if (real.length === 0) {
            return { items: 0, amountCents: null, currency: null };
        }
        const amountCents: number = real.reduce((total: number, holding: Holding): number => total + holding.valueMinor, 0);
        return { items: real.length, amountCents, currency: snapshot.baseCurrency };
    }
}
