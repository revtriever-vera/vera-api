import { Injectable } from '@nestjs/common';
import { TesouroBond, TesouroCsvReaderService, TesouroReadResult, treasuryKeyOf } from '../../catalog/services/tesouro-csv-reader.service';
import { FAILURE_REASONS, FAILURE_STAGES, QUOTE_PROVIDER_IDS, QuoteProviderId } from '../domain/market-data.types';
import { ProviderAsset, ProviderBatchResult, ProviderFailure, ProviderQuote, QuoteProviderPort } from '../ports/quote-provider.port';
import { failureOf, failuresFor } from './provider-batch';

const MAX_BATCH: number = 500;

function priceOf(bond: TesouroBond): string | null {
    return bond.baseUnitPrice ?? bond.sellUnitPrice;
}

@Injectable()
export class TesouroQuoteDriver extends QuoteProviderPort {
    public readonly provider: QuoteProviderId = QUOTE_PROVIDER_IDS.tesouro;
    public readonly maxBatchSize: number = MAX_BATCH;

    public constructor(private readonly reader: TesouroCsvReaderService) {
        super();
    }

    public async fetchBatch(assets: readonly ProviderAsset[]): Promise<ProviderBatchResult> {
        try {
            const result: TesouroReadResult = await this.reader.readLatest({ ignoreCache: true });
            return result.changed ? this.readBonds(assets, result.bonds) : { quotes: [], failures: [] };
        } catch (error: unknown) {
            return { quotes: [], failures: failuresFor(assets, error) };
        }
    }

    private readBonds(assets: readonly ProviderAsset[], bonds: readonly TesouroBond[]): ProviderBatchResult {
        const byKey: Map<string, TesouroBond> = new Map<string, TesouroBond>();
        for (const bond of bonds) {
            byKey.set(treasuryKeyOf(bond) ?? bond.typeName, bond);
        }
        const quotes: ProviderQuote[] = [];
        const failures: ProviderFailure[] = [];
        for (const asset of assets) {
            const bond: TesouroBond | undefined = byKey.get(asset.externalId);
            const price: string | null = bond === undefined ? null : priceOf(bond);
            if (bond === undefined || price === null) {
                failures.push(failureOf(asset, FAILURE_STAGES.notFound, FAILURE_REASONS.symbolUnknown));
                continue;
            }
            quotes.push({ assetId: asset.assetId, price, currency: 'BRL', priceDate: bond.baseDate, source: this.provider });
        }
        return { quotes, failures };
    }
}
