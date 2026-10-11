import { Injectable } from '@nestjs/common';
import { OnboardingArea, OnboardingAreaSummary, OnboardingAreaSummaryPort } from '../../onboarding/services/onboarding-area-summary.port';
import { PositionDomain } from '../domain/position.domain';

@Injectable()
export class PositionsOnboardingSummary extends OnboardingAreaSummaryPort {
    public readonly area: OnboardingArea = 'assets';

    public constructor(private readonly positions: PositionDomain) {
        super();
    }

    public async summarize(): Promise<OnboardingAreaSummary> {
        return { items: await this.positions.countReal(), amountCents: null, currency: null };
    }
}
