import { Injectable } from '@nestjs/common';
import { QuoteFetchFailuresRepository } from '../repositories/quote-fetch-failures.repository';
import { FailureWrite } from './market-data.types';

@Injectable()
export class QuoteFetchFailureDomain {
    public constructor(private readonly failures: QuoteFetchFailuresRepository) {}

    public async record(failures: readonly FailureWrite[]): Promise<void> {
        if (failures.length > 0) {
            await this.failures.record(failures);
        }
    }

    public async resolveForAssets(assetIds: readonly string[]): Promise<number> {
        return this.failures.resolveForAssets(assetIds, new Date());
    }

    public async countOpen(): Promise<number> {
        return this.failures.countOpen();
    }
}
