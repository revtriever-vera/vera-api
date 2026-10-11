import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { CutStatus } from '../domain/spending-cuts.types';

const IDENTIFIER: string = 'spending-cuts';

@Injectable()
export class SpendingCutsLogService {
    public constructor(private readonly logService: LogService) {}

    public cutsBuilt(month: string, status: CutStatus, categoriesWithCut: number, simulated: boolean): void {
        this.logService.debug({
            message: 'spending cuts built',
            identifier: IDENTIFIER,
            meta: { month, status, categoriesWithCut, simulated }
        });
    }
}
