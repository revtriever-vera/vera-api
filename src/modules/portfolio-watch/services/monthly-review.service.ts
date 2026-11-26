import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { InvestmentOperationsReaderService, OperationRecord } from '../../positions/services/investment-operations-reader.service';
import { PriceMove, ReturnsResult, ReviewLedgerEntry } from '../domain/monthly-review.types';
import { priceMovesOf, topGainersOf, topLosersOf } from '../domain/monthly-review-moves';
import { returnsOf } from '../domain/monthly-review-returns';
import { PortfolioIncomeLedgerDomain } from '../domain/portfolio-income-ledger.domain';
import { PortfolioMonthlySnapshotDomain } from '../domain/portfolio-monthly-snapshot.domain';
import { MonthlySnapshotEntry } from '../domain/portfolio-watch.types';
import { coverageMessageOf } from '../domain/review-coverage';
import { MonthIncome, monthIncomeOf } from '../domain/review-income';
import { firstDayOf, lastDayOf, monthAfter } from '../domain/review-months';
import { MonthlyReview } from '../validation/monthly-review.schemas';
import { MonthlyReviewBenchmarksService } from './monthly-review-benchmarks.service';
import { MonthlyReviewConcentrationService } from './monthly-review-concentration.service';
import { PortfolioWatchLogService } from './portfolio-watch-log.service';

type MoveRow = MonthlyReview['topGainers'][number];

interface Calculation {
    readonly month: string;
    readonly baseCurrency: string;
    readonly returns: ReturnsResult;
    readonly income: MonthIncome;
    readonly moves: readonly PriceMove[];
}

@Injectable()
export class MonthlyReviewService {
    public constructor(
        private readonly snapshots: PortfolioMonthlySnapshotDomain,
        private readonly ledger: PortfolioIncomeLedgerDomain,
        private readonly operations: InvestmentOperationsReaderService,
        private readonly benchmarks: MonthlyReviewBenchmarksService,
        private readonly concentration: MonthlyReviewConcentrationService,
        private readonly catalog: AssetCatalogService,
        private readonly logs: PortfolioWatchLogService
    ) {}

    @AsCompany()
    public async build(_companyId: string, month: string, now: Date = new Date()): Promise<MonthlyReview | null> {
        const end: MonthlySnapshotEntry[] = await this.snapshots.entriesOf(monthAfter(month));
        if (end.length === 0) {
            this.logs.reviewSkippedNoSnapshot(month);
            return null;
        }
        const calculation: Calculation = await this.calculate(month, end);
        const [benchmarks, concentration, gainers, losers] = await Promise.all([
            this.benchmarks.of(month),
            this.concentration.read(),
            this.movesWithSymbols(topGainersOf(calculation.moves)),
            this.movesWithSymbols(topLosersOf(calculation.moves))
        ]);
        return this.compose(calculation, { benchmarks, concentration, gainers, losers }, now);
    }

    private async calculate(month: string, end: readonly MonthlySnapshotEntry[]): Promise<Calculation> {
        const start: MonthlySnapshotEntry[] = await this.snapshots.entriesOf(month);
        const operations: OperationRecord[] = await this.operations.tradedBetween(firstDayOf(month), lastDayOf(month));
        const ledger: ReviewLedgerEntry[] = await this.ledger.paidBetween(firstDayOf(month), lastDayOf(month));
        const baseCurrency: string = (end[0] as MonthlySnapshotEntry).currency;
        const income: MonthIncome = monthIncomeOf(operations, ledger, baseCurrency);
        const returns: ReturnsResult = returnsOf({
            month,
            baseCurrency,
            start,
            end,
            operations,
            hasHistory: await this.operations.hasHistory(),
            incomeByAsset: income.byAsset
        });
        return { month, baseCurrency, returns, income, moves: priceMovesOf(start, end, operations) };
    }

    private async movesWithSymbols(moves: readonly PriceMove[]): Promise<MoveRow[]> {
        const assets: Asset[] = await this.catalog.findManyByIds(moves.map((move: PriceMove): string => move.assetId));
        const symbols: ReadonlyMap<string, string> = new Map(assets.map((asset: Asset): [string, string] => [asset.id, asset.symbol]));
        return moves.flatMap((move: PriceMove): MoveRow[] => {
            const symbol: string | undefined = symbols.get(move.assetId);
            return symbol === undefined ? [] : [{ assetId: move.assetId, symbol, variationPct: move.variationPct }];
        });
    }

    private compose(
        calculation: Calculation,
        parts: Pick<MonthlyReview, 'benchmarks' | 'concentration'> & { gainers: MoveRow[]; losers: MoveRow[] },
        now: Date
    ): MonthlyReview {
        const { month, returns } = calculation;
        return {
            month,
            baseCurrency: calculation.baseCurrency,
            ...(returns.returnPct === undefined ? {} : { returnPct: returns.returnPct }),
            byClass: [...returns.byClass],
            benchmarks: parts.benchmarks,
            topGainers: parts.gainers,
            topLosers: parts.losers,
            income: calculation.income.result,
            concentration: parts.concentration,
            coverage: { reason: returns.reason, message: coverageMessageOf(returns.reason, month), generatedAt: now.toISOString() }
        };
    }
}
