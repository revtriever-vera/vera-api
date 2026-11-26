import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { CvmDailyInformeReaderService, DailyQuote } from '../../catalog/services/cvm-daily-informe-reader.service';
import { FundCoverageDomain } from '../domain/fund-coverage.domain';
import { firstOfMonth, FundFetchPlan, fundFetchPlan, monthStartShifted } from '../domain/fund-history-months';
import { FundQuotePointDomain } from '../domain/fund-quote-point.domain';
import {
    FUND_HISTORY_IDLE_DAYS,
    FUND_HISTORY_RETENTION_MONTHS,
    FundCoverage,
    FundHistory,
    FundQuotePoint,
    QUOTE_PROVIDER_IDS
} from '../domain/market-data.types';
import { MarketDataLogService } from './market-data-log.service';
import { ProviderBudgetService } from './provider-budget.service';

export type { FundHistory };

const DAY_MS: number = 86_400_000;

export interface FundSeries {
    readonly assetId: string;
    readonly seriesKey: string;
}

interface Fetched {
    readonly points: FundQuotePoint[];
    readonly complete: boolean;
}

@Injectable()
export class FundQuoteHistoryService {
    public constructor(
        private readonly points: FundQuotePointDomain,
        private readonly coverage: FundCoverageDomain,
        private readonly informe: CvmDailyInformeReaderService,
        private readonly budget: ProviderBudgetService,
        private readonly logs: MarketDataLogService
    ) {}

    public async history(fund: FundSeries, from: string, asOf: string, now: Date = new Date()): Promise<FundHistory> {
        const stored: FundCoverage | null = await this.coverage.find(fund.assetId);
        const plan: FundFetchPlan = fundFetchPlan(stored, from, asOf);
        const months: string[] = [...plan.older, ...plan.newer];
        const fetched: Fetched = await this.fetchMonths(fund, months, now);
        if (fetched.points.length > 0) {
            await this.points.save(fund.assetId, fetched.points, now);
        }
        await this.recordRead(fund, stored, plan, fetched.complete, { from, asOf, now });
        return { points: await this.points.between(fund.assetId, from, asOf), complete: fetched.complete };
    }

    public async pruneHistory(now: Date = new Date()): Promise<void> {
        const cutoff: string = monthStartShifted(DateUtil.todayInBrazil(now), -FUND_HISTORY_RETENTION_MONTHS);
        const points: number = await this.points.pruneBefore(cutoff);
        await this.coverage.trimBefore(cutoff, now);
        const idleIds: string[] = await this.coverage.removeIdle(new Date(now.getTime() - FUND_HISTORY_IDLE_DAYS * DAY_MS));
        const idlePoints: number = await this.points.removeForAssets(idleIds);
        this.logs.fundHistoryPruned(points + idlePoints, idleIds.length);
    }

    private async recordRead(
        fund: FundSeries,
        stored: FundCoverage | null,
        plan: FundFetchPlan,
        complete: boolean,
        range: { readonly from: string; readonly asOf: string; readonly now: Date }
    ): Promise<void> {
        if (!complete || (plan.older.length === 0 && plan.newer.length === 0)) {
            await this.coverage.touch(fund.assetId, range.now);
            return;
        }
        await this.coverage.save(fund.assetId, this.coverageAfter(stored, plan, range.from, range.asOf), range.now);
    }

    private coverageAfter(stored: FundCoverage | null, plan: FundFetchPlan, from: string, asOf: string): FundCoverage {
        const start: string = firstOfMonth(from);
        return {
            coveredFrom: stored === null || start < stored.coveredFrom ? start : stored.coveredFrom,
            coveredTo: plan.newer.length > 0 || stored === null ? asOf : stored.coveredTo
        };
    }

    private async fetchMonths(fund: FundSeries, months: readonly string[], now: Date): Promise<Fetched> {
        if (months.length === 0) {
            return { points: [], complete: true };
        }
        if (!(await this.budget.reserve(QUOTE_PROVIDER_IDS.cvm, months.length, now))) {
            return { points: [], complete: false };
        }
        const points: FundQuotePoint[] = [];
        for (const month of months) {
            try {
                const found: readonly DailyQuote[] = await this.informe.monthPoints(month, fund.seriesKey);
                points.push(...found.map((quote: DailyQuote): FundQuotePoint => ({ date: quote.date, quota: quote.quota })));
            } catch (error: unknown) {
                this.logs.fundHistoryFailed(month, error);
                return { points, complete: false };
            }
        }
        return { points, complete: true };
    }
}
