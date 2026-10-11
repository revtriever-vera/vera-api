import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const SUGGEST: string = 'contribution-suggest';

export interface SuggestLogFields {
    readonly classesFunded: number;
    readonly assetsFunded: number;
    readonly warnings: number;
}

@Injectable()
export class ContributionLogService {
    public constructor(private readonly logService: LogService) {}

    public suggested(fields: SuggestLogFields): void {
        this.logService.info({ message: 'contribution suggested', identifier: SUGGEST, meta: { ...fields } });
    }

    public targetsNotSet(): void {
        this.logService.info({
            message: 'contribution refused: class targets not set',
            identifier: SUGGEST,
            meta: { result: 'targets_not_set' }
        });
    }
}
