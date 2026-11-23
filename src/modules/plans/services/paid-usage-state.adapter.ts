import { Injectable } from '@nestjs/common';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { UsageState } from '../../../core/usage/usage.types';
import { PaidUsageSnapshot } from '../domain/plans.types';
import { PaidUsageStatePort } from './paid-usage-state.port';

@Injectable()
export class PaidUsageStateAdapter extends PaidUsageStatePort {
    public constructor(private readonly meter: PaidUsageMeter) {
        super();
    }

    public async state(): Promise<PaidUsageSnapshot> {
        const state: UsageState = await this.meter.state();
        return {
            usedBps: state.usedBps,
            state: state.state,
            resetsAt: state.resetsAt,
            byFeature: { ai: { usedBps: state.byFeature.ai }, whatsapp: { usedBps: state.byFeature.whatsapp } }
        };
    }
}
