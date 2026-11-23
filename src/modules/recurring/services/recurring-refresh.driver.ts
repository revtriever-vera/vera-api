import { Injectable } from '@nestjs/common';
import { RecurringRefreshPort } from '../../transactions/services/recurring-refresh.port';
import { RecurringDetectPublisherService } from './recurring-detect-publisher.service';

@Injectable()
export class RecurringRefreshDriver extends RecurringRefreshPort {
    public constructor(private readonly publisher: RecurringDetectPublisherService) {
        super();
    }

    public async refresh(companyId: string): Promise<void> {
        await this.publisher.request(companyId);
    }
}
