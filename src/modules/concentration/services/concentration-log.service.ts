import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const CONCENTRATION: string = 'concentration';

@Injectable()
export class ConcentrationLogService {
    public constructor(private readonly logService: LogService) {}

    public computed(groups: number, unmapped: number): void {
        this.logService.debug({
            message: 'concentration computed',
            identifier: CONCENTRATION,
            meta: { groups, unmapped }
        });
    }
}
