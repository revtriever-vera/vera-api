import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { FundQuotePointsRepository } from '../repositories/fund-quote-points.repository';
import { FundQuotePoint } from './market-data.types';

@Injectable()
export class FundQuotePointDomain {
    public constructor(private readonly points: FundQuotePointsRepository) {}

    public async between(assetId: string, from: string, to: string): Promise<FundQuotePoint[]> {
        return this.points.listBetween(assetId, from, to);
    }

    public async save(assetId: string, points: readonly FundQuotePoint[], at: Date): Promise<void> {
        await this.points.upsertMany(assetId, points, at);
    }

    public async pruneBefore(cutoff: string): Promise<number> {
        return this.points.pruneBefore(DateUtil.startOfDayUtc(cutoff));
    }

    public async removeForAssets(assetIds: readonly string[]): Promise<number> {
        return this.points.removeForAssets(assetIds);
    }
}
