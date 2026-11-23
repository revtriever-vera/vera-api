import { Injectable } from '@nestjs/common';
import { ANY_HOLDER, HolderFilter } from '../../../shared/holder/holder-filter';
import { decimalStringOf, mulDecimal, toMinor } from '../../../shared/utils/decimal.util';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { FixedIncomeValuationService, ValuedTitle } from '../../fixed-income/services/fixed-income-valuation.service';
import { CurveSeries } from '../../fixed-income/services/index-series-math';
import { IndexSeriesReaderService } from '../../fixed-income/services/index-series-reader.service';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { ExchangeRateReaderService, StoredRate } from '../../market-data/services/exchange-rate-reader.service';
import { QuoteReaderService, StoredQuote } from '../../market-data/services/quote-reader.service';
import { Position, PositionReaderService } from '../../positions/services/position-reader.service';
import { treasuryKindOf } from '../domain/treasury-kind';
import { ScheduleInputs, ScheduleTitle, ScheduleTreasury, TreasuryKind } from '../domain/schedule.types';

const USD: string = 'USD';
const BRL: string = 'BRL';

export type { ScheduleTreasury };
export type TitlesInputs = Pick<ScheduleInputs, 'today' | 'series' | 'titles'>;

interface TreasuryHolding {
    readonly position: Position;
    readonly asset: Asset;
    readonly kind: TreasuryKind;
}

@Injectable()
export class ScheduleSourceService {
    public constructor(
        private readonly valuation: FixedIncomeValuationService,
        private readonly seriesReader: IndexSeriesReaderService,
        private readonly positions: PositionReaderService,
        private readonly catalog: AssetCatalogService,
        private readonly quotes: QuoteReaderService,
        private readonly rates: ExchangeRateReaderService,
        private readonly issuers: IssuerDirectoryService
    ) {}

    public async loadTitles(now: Date): Promise<TitlesInputs> {
        const [valued, series]: [readonly ValuedTitle[], CurveSeries] = await Promise.all([
            this.valuation.valueAll(now, ANY_HOLDER),
            this.seriesReader.loadCurveSeries()
        ]);
        return {
            today: FixedIncomeValuationService.referenceDate(now),
            series,
            titles: valued.map((entry: ValuedTitle): ScheduleTitle => this.titleOf(entry))
        };
    }

    public async load(now: Date): Promise<ScheduleInputs> {
        const [base, treasuries]: [TitlesInputs, ScheduleTreasury[]] = await Promise.all([
            this.loadTitles(now),
            this.loadTreasuries(ANY_HOLDER)
        ]);
        const usdRate: string | null = base.titles.some((title: ScheduleTitle): boolean => title.currency === USD)
            ? await this.usdRate(now)
            : null;
        return { ...base, treasuries, usdRate };
    }

    private async usdRate(now: Date): Promise<string | null> {
        const stored: StoredRate | null = await this.rates.latest(USD, now);
        return stored === null ? null : stored.brlPerUnit;
    }

    private titleOf(entry: ValuedTitle): ScheduleTitle {
        const issuerId: string | null = entry.title.issuerId;
        const issuer: ReturnType<IssuerDirectoryService['find']> = issuerId === null ? null : this.issuers.find(issuerId);
        return {
            id: entry.title.id,
            name: entry.title.name,
            kind: entry.title.kind,
            indexer: entry.title.indexer,
            rateBps: entry.title.rateBps,
            currency: entry.title.currency,
            appliedMinor: entry.title.appliedMinor,
            appliedAt: entry.title.appliedAt,
            maturityDate: entry.title.maturityDate,
            taxRegime: entry.title.taxRegime,
            issuerName: issuer === null ? null : issuer.name,
            valueMinor: entry.valuation.valueMinor,
            valuationEstimated: entry.valuation.estimated,
            indexDataMissing: entry.valuation.status === 'index_data_missing',
            matured: entry.valuation.matured,
            isSample: entry.title.isSample
        };
    }

    public async loadTreasuries(filter: HolderFilter): Promise<ScheduleTreasury[]> {
        const positions: readonly Position[] = await this.positions.listForCompany(filter);
        if (positions.length === 0) {
            return [];
        }
        const assets: Asset[] = await this.catalog.findManyByIds(positions.map((position: Position): string => position.assetId));
        const holdings: TreasuryHolding[] = this.treasuryHoldings(positions, assets);
        const assetIds: string[] = holdings.map((holding: TreasuryHolding): string => holding.asset.id);
        const latest: ReadonlyMap<string, StoredQuote> =
            assetIds.length === 0 ? new Map<string, StoredQuote>() : await this.quotes.getLatest(assetIds);
        return holdings.map((holding: TreasuryHolding): ScheduleTreasury => this.treasuryOf(holding, latest));
    }

    private treasuryHoldings(positions: readonly Position[], assets: readonly Asset[]): TreasuryHolding[] {
        const byId: ReadonlyMap<string, Asset> = new Map<string, Asset>(assets.map((asset: Asset): [string, Asset] => [asset.id, asset]));
        return positions.flatMap((position: Position): TreasuryHolding[] => {
            const asset: Asset | undefined = byId.get(position.assetId);
            const kind: TreasuryKind | null = asset === undefined ? null : treasuryKindOf(asset);
            return asset === undefined || kind === null ? [] : [{ position, asset, kind }];
        });
    }

    private treasuryOf(holding: TreasuryHolding, latest: ReadonlyMap<string, StoredQuote>): ScheduleTreasury {
        const quantity: string = decimalStringOf(holding.position.quantity);
        const quote: StoredQuote | undefined = latest.get(holding.asset.id);
        return {
            id: holding.position.id,
            name: holding.asset.symbol,
            kind: holding.kind,
            quantity,
            maturityDate: holding.asset.maturityDate as string,
            valueTodayMinor: quote === undefined ? null : toMinor(mulDecimal(quantity, quote.price), BRL),
            isSample: holding.position.isSample,
            holderUserId: holding.position.holderUserId
        };
    }
}
