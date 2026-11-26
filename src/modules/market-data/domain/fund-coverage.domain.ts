import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { FundQuoteCoverageRepository } from '../repositories/fund-quote-coverage.repository';
import { FundCoverage, FundCoverageRow } from './market-data.types';

@Injectable()
export class FundCoverageDomain {
    public constructor(private readonly coverage: FundQuoteCoverageRepository) {}

    public async find(assetId: string): Promise<FundCoverage | null> {
        const row: FundCoverageRow | null = await this.coverage.findByAsset(assetId);
        return row === null
            ? null
            : { coveredFrom: DateUtil.onlyLocalDateString(row.coveredFrom), coveredTo: DateUtil.onlyLocalDateString(row.coveredTo) };
    }

    public async save(assetId: string, coverage: FundCoverage, at: Date): Promise<void> {
        await this.coverage.save(assetId, coverage.coveredFrom, coverage.coveredTo, at);
    }

    public async touch(assetId: string, at: Date): Promise<void> {
        await this.coverage.touch(assetId, at);
    }

    public async trimBefore(cutoff: string, at: Date): Promise<void> {
        await this.coverage.trimBefore(DateUtil.startOfDayUtc(cutoff), at);
    }

    public async removeIdle(readBefore: Date): Promise<string[]> {
        return this.coverage.removeIdle(readBefore);
    }
}
