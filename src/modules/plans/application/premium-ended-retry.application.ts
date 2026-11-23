import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { CompanyProduct } from '../domain/plans.types';
import { PlansLogService } from '../services/plans-log.service';
import { PremiumEndedService } from '../services/premium-ended.service';
import { TrialLifecycleService, TrialOutcome } from '../services/trial-lifecycle.service';

@Injectable()
export class PremiumEndedRetryApplication {
    public constructor(
        private readonly ended: PremiumEndedService,
        private readonly trials: TrialLifecycleService,
        private readonly logs: PlansLogService
    ) {}

    public async sweep(): Promise<number> {
        return this.ended.sweep();
    }

    public async retry(companyId: string, notificationId: string): Promise<void> {
        await this.ended.retryOne(companyId, notificationId);
    }

    public async sweepTrials(now: Date = new Date()): Promise<number> {
        const due: CompanyProduct[] = await this.trials.due(now);
        let handled: number = 0;
        for (const line of due) {
            handled += (await this.settleSafely(line.companyId, now)) === 'none' ? 0 : 1;
        }
        return handled;
    }

    @AsCompany()
    public async settleTrial(companyId: string, now: Date): Promise<TrialOutcome> {
        return this.trials.settle(companyId, now);
    }

    private async settleSafely(companyId: string, now: Date): Promise<TrialOutcome> {
        try {
            return await this.settleTrial(companyId, now);
        } catch (error: unknown) {
            this.logs.trialSettleFailed(error);
            return 'none';
        }
    }
}
