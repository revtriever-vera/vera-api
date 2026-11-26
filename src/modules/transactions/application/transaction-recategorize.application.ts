import { Injectable } from '@nestjs/common';
import { RecategorizedView, RecategorizePayload, TransactionRecategorizeService } from '../services/transaction-recategorize.service';

export type { RecategorizedView, RecategorizePayload, RuleSummary } from '../services/transaction-recategorize.service';

@Injectable()
export class TransactionRecategorizeApplication {
    public constructor(private readonly recategorization: TransactionRecategorizeService) {}

    public async recategorize(id: string, payload: RecategorizePayload): Promise<RecategorizedView> {
        return this.recategorization.recategorize(id, payload);
    }
}
