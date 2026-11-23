import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const FGC_COVERAGE: string = 'fgc-coverage';

@Injectable()
export class FgcLogService {
    public constructor(private readonly logService: LogService) {}

    public computed(groups: number, overGroups: number, outside: number): void {
        this.logService.debug({
            message: 'fgc coverage computed',
            identifier: FGC_COVERAGE,
            meta: { groups, overGroups, outside }
        });
    }
}
