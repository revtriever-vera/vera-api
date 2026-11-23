import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { RecurringNoticePublisherService } from './recurring-notice-publisher.service';
import { RecurringNoticeSchedulerService } from './recurring-notice-scheduler.service';

export const RECURRING_NOTICES_ERASE_AREA: string = 'recurring-notices';

@Injectable()
export class RecurringNoticesAccountEraser extends AccountDataEraserPort {
    public readonly area: string = RECURRING_NOTICES_ERASE_AREA;

    public constructor(
        private readonly scheduler: RecurringNoticeSchedulerService,
        private readonly publisher: RecurringNoticePublisherService
    ) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        await this.publisher.cancel(await this.scheduler.jobIdsOfCompany());
        return 0;
    }
}
