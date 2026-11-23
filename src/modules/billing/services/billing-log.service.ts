import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { BillingOperation, BillingOutcome } from '../domain/billing-engine.types';

const ENGINE: string = 'billing-engine';

export interface EngineCallLog {
    readonly operation: BillingOperation;
    readonly outcome: BillingOutcome;
    readonly latencyMs: number;
    readonly status: number | null;
    readonly problemType: string | null;
}

@Injectable()
export class BillingLogService {
    public constructor(private readonly logService: LogService) {}

    public engineCall(call: EngineCallLog): void {
        this.logService.info({
            message: 'billing engine call',
            identifier: ENGINE,
            meta: {
                operation: call.operation,
                outcome: call.outcome,
                latencyMs: call.latencyMs,
                status: call.status,
                problemType: call.problemType
            }
        });
    }

    public engineUnauthorized(operation: BillingOperation): void {
        this.logService.error({
            message: 'billing engine rejected the api key',
            identifier: ENGINE,
            meta: { operation, status: 401 }
        });
    }

    public fakeDeliveryFailed(eventType: string, reason: string): void {
        this.logService.warn({ message: 'fake billing event not delivered', identifier: ENGINE, meta: { eventType, reason } });
    }
}
