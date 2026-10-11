import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const SNAPSHOT: string = 'portfolio-snapshot';
const ORPHAN_HOLDING: string = 'portfolio-orphan-holding';

export interface SnapshotLogFields {
    readonly holdings: number;
    readonly classes: number;
    readonly missingQuotes: number;
    readonly staleQuotes: number;
    readonly durationMs: number;
}

@Injectable()
export class PortfolioLogService {
    public constructor(private readonly logService: LogService) {}

    public snapshot(fields: SnapshotLogFields): void {
        this.logService.info({ message: 'portfolio snapshot built', identifier: SNAPSHOT, meta: { ...fields } });
    }

    public orphanHolding(subjectType: string, subjectId: string): void {
        this.logService.error({
            message: 'holding without class assignment',
            identifier: ORPHAN_HOLDING,
            meta: { subjectType, subjectId }
        });
    }
}
