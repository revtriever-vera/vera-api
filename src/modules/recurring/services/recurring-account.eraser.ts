import { Injectable } from '@nestjs/common';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { RecurringDetectPublisherService } from './recurring-detect-publisher.service';

export const RECURRING_ERASE_AREA: string = 'recurring';

@Injectable()
export class RecurringAccountEraser extends AccountDataEraserPort {
    public readonly area: string = RECURRING_ERASE_AREA;

    public constructor(private readonly publisher: RecurringDetectPublisherService) {
        super();
    }

    /**
     * The rows leave with the ON DELETE CASCADE of the company. The cascade does not reach the pending detection job
     * (current and next window), so it is cancelled here; removing a job that is not there is harmless, so a retry is safe.
     */
    public async eraseAll(companyId: string): Promise<number> {
        await this.publisher.cancel(companyId);
        return 0;
    }
}
