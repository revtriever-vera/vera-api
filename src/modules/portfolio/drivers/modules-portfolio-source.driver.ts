import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { decimalStringOf } from '../../../shared/utils/decimal.util';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { FixedIncomeValuationService, ValuedTitle } from '../../fixed-income/services/fixed-income-valuation.service';
import { ExchangeRateReaderService, StoredRate } from '../../market-data/services/exchange-rate-reader.service';
import { QuoteReaderService, StoredQuote } from '../../market-data/services/quote-reader.service';
import { Position, PositionReaderService } from '../../positions/services/position-reader.service';
import {
    INDEX_DATA_MISSING_STATUS,
    PortfolioSourceData,
    SourceAsset,
    SourcePosition,
    SourceQuote,
    SourceRate,
    SourceTitle,
    USD_CURRENCY
} from '../domain/portfolio.types';
import { PortfolioSourcePort } from '../ports/portfolio-source.port';
import { ClassInputs, PortfolioClassInputsService } from '../services/portfolio-class-inputs.service';

interface MarketInputs {
    readonly assets: readonly SourceAsset[];
    readonly quotes: readonly SourceQuote[];
}

@Injectable()
export class ModulesPortfolioSourceDriver extends PortfolioSourcePort {
    public constructor(
        private readonly positions: PositionReaderService,
        private readonly fixedIncome: FixedIncomeValuationService,
        private readonly catalog: AssetCatalogService,
        private readonly quotes: QuoteReaderService,
        private readonly rates: ExchangeRateReaderService,
        private readonly classInputs: PortfolioClassInputsService
    ) {
        super();
    }

    public async load(): Promise<PortfolioSourceData> {
        const now: Date = new Date();
        const [positions, titles, classInputs, usdRate]: [readonly Position[], readonly ValuedTitle[], ClassInputs, StoredRate | null] =
            await Promise.all([
                this.positions.listForCompany(),
                this.fixedIncome.valueAll(now),
                this.classInputs.load(),
                this.rates.latest(USD_CURRENCY, now)
            ]);
        const market: MarketInputs = await this.loadMarket(positions);
        return {
            ...this.baseOf(classInputs, now),
            positions: positions.map((position: Position): SourcePosition => this.positionOf(position)),
            ...market,
            titles: titles.map((entry: ValuedTitle): SourceTitle => this.titleOf(entry)),
            classes: classInputs.classes,
            assignments: classInputs.assignments,
            usdRate: usdRate === null ? null : this.rateOf(usdRate)
        };
    }

    private baseOf(classInputs: ClassInputs, now: Date): Pick<PortfolioSourceData, 'asOf' | 'baseCurrency' | 'toleranceBps'> {
        return { asOf: DateUtil.todayInBrazil(now), baseCurrency: classInputs.baseCurrency, toleranceBps: classInputs.toleranceBps };
    }

    private async loadMarket(positions: readonly Position[]): Promise<MarketInputs> {
        if (positions.length === 0) {
            return { assets: [], quotes: [] };
        }
        const assetIds: string[] = positions.map((position: Position): string => position.assetId);
        const [assets, quotes]: [Asset[], ReadonlyMap<string, StoredQuote>] = await Promise.all([
            this.catalog.findManyByIds(assetIds),
            this.quotes.getLatest(assetIds)
        ]);
        return {
            assets: assets.map((asset: Asset): SourceAsset => this.assetOf(asset)),
            quotes: [...quotes.values()].map((quote: StoredQuote): SourceQuote => ({ ...quote }))
        };
    }

    private positionOf(position: Position): SourcePosition {
        return { id: position.id, assetId: position.assetId, quantity: decimalStringOf(position.quantity) };
    }

    private assetOf(asset: Asset): SourceAsset {
        return {
            id: asset.id,
            symbol: asset.symbol,
            name: asset.name,
            market: asset.market,
            typeGroup: asset.typeGroup,
            currency: asset.currency,
            quantityDecimals: asset.quantityDecimals,
            dollarExposure: asset.dollarExposure
        };
    }

    private titleOf(entry: ValuedTitle): SourceTitle {
        return {
            id: entry.title.id,
            name: entry.title.name,
            indexDataMissing: entry.valuation.status === INDEX_DATA_MISSING_STATUS,
            valueMinor: entry.valuation.valueMinor,
            currency: entry.valuation.currency,
            estimated: entry.valuation.estimated,
            matured: entry.valuation.matured,
            source: entry.valuation.source,
            asOf: entry.valuation.asOf
        };
    }

    private rateOf(rate: StoredRate): SourceRate {
        return { brlPerUnit: rate.brlPerUnit, date: rate.date, source: rate.source };
    }
}
