import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { GoalNoticesPublisherService } from './goal-notices-publisher.service';

export const GOAL_NOTICES_ERASE_AREA: string = 'goal-notices';

@Injectable()
export class GoalNoticesAccountEraser extends AccountDataEraserPort {
    public readonly area: string = GOAL_NOTICES_ERASE_AREA;

    public constructor(private readonly publisher: GoalNoticesPublisherService) {
        super();
    }

    /**
     * The marks leave with the ON DELETE CASCADE of the company. The cascade does not reach the pending evaluation job
     * (yesterday's and today's), so it is cancelled here; removing a job that is not there is harmless, so a retry is safe.
     */
    public async eraseAll(companyId: string): Promise<number> {
        await this.publisher.cancel(companyId, DateUtil.todayInBrazil());
        return 0;
    }
}
