import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { PositionAction } from '../domain/positions.types';

const WRITE: string = 'positions-write';
const DUPLICATE: string = 'positions-duplicate';

@Injectable()
export class PositionsLogService {
    public constructor(private readonly logService: LogService) {}

    public written(action: PositionAction, positionId: string, assetId: string): void {
        this.logService.info({ message: 'position written', identifier: WRITE, meta: { positionId, assetId, action } });
    }

    public duplicate(assetId: string, existingPositionId: string): void {
        this.logService.info({ message: 'asset already in portfolio', identifier: DUPLICATE, meta: { assetId, existingPositionId } });
    }
}
