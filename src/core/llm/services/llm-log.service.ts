import { Injectable } from '@nestjs/common';
import { LogService } from '../../observability/log.service';
import { LlmFeature } from '../llm.types';

const PRICING: string = 'llm-pricing';
const QUOTA: string = 'llm-quota';

@Injectable()
export class LlmLogService {
    public constructor(private readonly logService: LogService) {}

    public unpricedModel(modelId: string): void {
        this.logService.error({ message: 'model without price in the price table', identifier: PRICING, meta: { modelId } });
    }

    public capReached(task: string, feature: LlmFeature): void {
        this.logService.info({ message: 'cap reached', identifier: QUOTA, meta: { task, feature } });
    }

    public bookkeepingFailed(task: string, step: string, error: unknown): void {
        this.logService.error({ message: 'llm bookkeeping failed', identifier: QUOTA, meta: { task, step }, error });
    }
}
