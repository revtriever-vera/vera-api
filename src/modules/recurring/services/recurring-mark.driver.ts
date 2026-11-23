import { Injectable } from '@nestjs/common';
import { RecurringMarkPort } from '../../transactions/services/recurring-mark.port';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';

@Injectable()
export class RecurringMarkDriver extends RecurringMarkPort {
    public constructor(private readonly series: RecurringSeriesDomain) {
        super();
    }

    public async confirmedTransactionIds(transactionIds: readonly string[]): Promise<ReadonlySet<string>> {
        return this.series.confirmedChargeTransactionIds(transactionIds);
    }
}
