import { Injectable } from '@nestjs/common';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { B3_MARKET } from '../domain/investment-import.types';
import { ParsedSecuritySpec, parseSecuritySpec, pickBySecuritySpec, SpecCandidate } from '../domain/model/security-spec';

const CANDIDATES_PER_SPEC: number = 30;

function candidatesOf(assets: readonly Asset[]): SpecCandidate[] {
    return assets.map((asset: Asset): SpecCandidate => ({ symbol: asset.symbol, name: asset.name, kind: asset.kind }));
}

function longestOf(words: readonly string[]): string {
    return words.reduce((best: string, word: string): string => (word.length > best.length ? word : best), '');
}

@Injectable()
export class NoteAssetResolverService {
    public constructor(private readonly catalog: AssetCatalogService) {}

    public async resolve(specs: readonly string[]): Promise<ReadonlyMap<string, string>> {
        const resolved: Map<string, string> = new Map();
        for (const spec of specs) {
            const ticker: string | null = await this.tickerOf(spec);
            if (ticker !== null) {
                resolved.set(spec, ticker);
            }
        }
        return resolved;
    }

    private async tickerOf(spec: string): Promise<string | null> {
        const parsed: ParsedSecuritySpec | null = parseSecuritySpec(spec);
        if (parsed === null) {
            return null;
        }
        const found: Asset[] = await this.catalog.searchByName(B3_MARKET, longestOf(parsed.words), CANDIDATES_PER_SPEC);
        return pickBySecuritySpec(parsed, candidatesOf(found));
    }
}
