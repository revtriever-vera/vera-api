import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { PaidUsageHistoryService } from '../../../core/usage/services/paid-usage-history.service';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { UsageCompaniesGaugeService } from '../../../core/usage/services/usage-companies-gauge.service';
import { UsageState, UsageThresholdPayload } from '../../../core/usage/usage.types';
import { PlanGateService } from '../services/plan-gate.service';
import { UsageNotifier } from '../services/usage-notifier.service';
import { Usage } from '../validation/usage.schemas';

@Injectable()
export class UsageApplication {
    public constructor(
        private readonly meter: PaidUsageMeter,
        private readonly history: PaidUsageHistoryService,
        private readonly gauge: UsageCompaniesGaugeService,
        private readonly gate: PlanGateService,
        private readonly notifier: UsageNotifier
    ) {}

    public async read(): Promise<Usage> {
        const state: UsageState = await this.meter.state();
        return {
            period: state.period,
            state: state.state,
            usedBps: state.usedBps,
            resetsAt: state.resetsAt,
            byFeature: { ai: { usedBps: state.byFeature.ai }, whatsapp: { usedBps: state.byFeature.whatsapp } },
            capMicros: this.gate.mode() === 'self_hosted' ? state.capMicros : null
        };
    }

    @AsCompany()
    public async sendNotice(companyId: string, payload: UsageThresholdPayload): Promise<void> {
        await this.notifier.notify({ companyId, period: payload.period, kind: payload.kind, usedBps: payload.usedBps });
    }

    public async purgeExpired(): Promise<number> {
        return this.history.purgeExpired();
    }

    public async publishGauge(): Promise<void> {
        await this.gauge.publish();
    }
}
