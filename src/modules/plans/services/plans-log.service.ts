import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { FeatureState, PaidFeature } from '../domain/plans.types';

const GATE: string = 'plans-gate';
const CONTRACT: string = 'plans-contract';
const LIFECYCLE: string = 'plans-lifecycle';

@Injectable()
export class PlansLogService {
    public constructor(private readonly logService: LogService) {}

    public gateDenied(feature: PaidFeature, state: FeatureState): void {
        this.logService.info({ message: 'feature denied', identifier: GATE, meta: { feature, state } });
    }

    public contractOpened(product: string): void {
        this.logService.info({ message: 'contract opened', identifier: CONTRACT, meta: { product } });
    }

    public contractClosed(product: string, reason: string): void {
        this.logService.info({ message: 'contract closed', identifier: CONTRACT, meta: { product, reason } });
    }

    public premiumEnded(handlers: number, failed: number): void {
        this.logService.info({ message: 'premium ended', identifier: LIFECYCLE, meta: { handlers, failed } });
    }

    public handlerFailed(handler: string, error: unknown): void {
        this.logService.warn({ message: 'premium ended handler failed', identifier: LIFECYCLE, meta: { handler }, error });
    }
}
