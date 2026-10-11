import { Injectable } from '@nestjs/common';
import { OnboardingArea, OnboardingAreaSummary, OnboardingAreaSummaryPort } from '../../onboarding/services/onboarding-area-summary.port';
import { AssetClass } from '../domain/allocation.types';
import { ClassReaderService } from './class-reader.service';

@Injectable()
export class AllocationTargetSummary extends OnboardingAreaSummaryPort {
    public readonly area: OnboardingArea = 'target';

    public constructor(private readonly classes: ClassReaderService) {
        super();
    }

    public async summarize(): Promise<OnboardingAreaSummary> {
        const classes: readonly AssetClass[] = await this.classes.listForCompany();
        const targeted: number = classes.filter((item: AssetClass): boolean => item.targetBps > 0).length;
        return { items: targeted, amountCents: null, currency: null };
    }
}
