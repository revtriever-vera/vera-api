import { Injectable } from '@nestjs/common';
import { LogService } from '../../observability/log.service';
import { NoticeKind, UsageFeature } from '../usage.types';

const USAGE: string = 'usage';
const USAGE_FX: string = 'usage-fx';

@Injectable()
export class UsageLogService {
    public constructor(private readonly logService: LogService) {}

    public capReached(feature: UsageFeature, task: string, period: string): void {
        this.logService.info({ message: 'cap reached', identifier: USAGE, meta: { feature, task, period } });
    }

    public recordedAboveEstimate(task: string, estimateMicros: number, costMicros: number): void {
        this.logService.warn({ message: 'recorded above estimate', identifier: USAGE, meta: { task, estimateMicros, costMicros } });
    }

    public thresholdCrossed(kind: NoticeKind, period: string): void {
        this.logService.info({ message: 'threshold crossed', identifier: USAGE, meta: { kind, period } });
    }

    public fallbackRate(error: unknown): void {
        this.logService.warn({ message: 'usd rate fallback', identifier: USAGE_FX, error });
    }
}
