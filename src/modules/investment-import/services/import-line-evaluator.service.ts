import { Injectable } from '@nestjs/common';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { AssetSimulation, OperationInput, PositionOperationsService } from '../../positions/services/position-operations.service';
import {
    B3_MARKET,
    CRYPTO_MARKET,
    EditedLine,
    EffectLine,
    EvaluatedLine,
    LINE_REASONS,
    LINE_STATUSES,
    StoredLine,
    US_MARKET
} from '../domain/investment-import.types';
import { foreignCheckOf, ForeignCheckInput } from '../domain/foreign/foreign-checks';
import { balanceViewOf, evaluatedOf, hasUnsupportedDirection, LineFacts, LineVerdict, verdictOf } from '../domain/line-evaluation';
import { operationOf } from './import-operation.builder';

export interface Evaluation {
    readonly lines: readonly EvaluatedLine[];
    readonly effects: readonly EffectLine[];
    readonly operations: readonly OperationInput[];
    readonly foreignChecks: ReadonlyMap<string, string>;
}

interface Simulated {
    readonly failures: ReadonlyMap<number, string>;
    readonly held: ReadonlySet<string>;
    readonly effects: readonly EffectLine[];
    readonly afterQuantities: ReadonlyMap<string, string>;
}

function tickerKeyOf(market: string, ticker: string): string {
    return `${market}:${ticker}`;
}

function tickersOf(lines: readonly StoredLine[], market: string): string[] {
    return [...new Set(lines.filter((line: StoredLine): boolean => line.market === market).map((line: StoredLine): string => line.ticker))];
}

const APPLICABLE: ReadonlySet<string> = new Set([LINE_STATUSES.ok, LINE_STATUSES.check]);

function effectOf(simulation: AssetSimulation, asset: Asset | undefined): EffectLine {
    return {
        assetId: simulation.effect.assetId,
        ticker: asset?.symbol ?? '',
        name: asset?.name ?? '',
        existingPosition: simulation.hasPosition,
        before: balanceViewOf(simulation.effect.before),
        after: balanceViewOf(simulation.effect.after)
    };
}

function summarize(simulations: readonly AssetSimulation[], assets: ReadonlyMap<string, Asset>): Simulated {
    const failures: Map<number, string> = new Map(
        simulations.flatMap((simulation: AssetSimulation): [number, string][] =>
            simulation.failures.map((failure): [number, string] => [failure.lineNumber, failure.reason])
        )
    );
    const held: Set<string> = new Set(
        simulations
            .filter((simulation: AssetSimulation): boolean => simulation.hasPosition)
            .map((simulation: AssetSimulation): string => simulation.effect.assetId)
    );
    const effects: EffectLine[] = simulations.map((simulation: AssetSimulation): EffectLine =>
        effectOf(simulation, assets.get(simulation.effect.assetId))
    );
    const afterQuantities: Map<string, string> = new Map(
        effects.map((effect: EffectLine): [string, string] => [effect.assetId, effect.after?.quantity ?? '0'])
    );
    return { failures, held, effects, afterQuantities };
}

function withoutDropped(first: Simulated, second: Simulated): Simulated {
    const rebuilt: ReadonlyMap<string, EffectLine> = new Map(
        second.effects.map((effect: EffectLine): [string, EffectLine] => [effect.assetId, effect])
    );
    const effects: EffectLine[] = first.effects.map(
        (effect: EffectLine): EffectLine => rebuilt.get(effect.assetId) ?? { ...effect, after: effect.before }
    );
    const afterQuantities: Map<string, string> = new Map(
        effects.map((effect: EffectLine): [string, string] => [effect.assetId, effect.after?.quantity ?? '0'])
    );
    return { failures: first.failures, held: first.held, effects, afterQuantities };
}

function factsOf(
    item: EditedLine,
    asset: Asset | undefined,
    duplicates: ReadonlySet<number>,
    simulated: Simulated,
    latest: ReadonlyMap<string, string>
): LineFacts {
    const assetId: string | null = asset?.id ?? null;
    return {
        edited: item,
        assetId,
        duplicate: duplicates.has(item.line.lineNumber),
        failure: simulated.failures.get(item.line.lineNumber) ?? null,
        hasPosition: assetId !== null && simulated.held.has(assetId),
        foreignCheck: assetId === null ? null : foreignCheckOf(item.line, foreignInputOf(assetId, simulated, latest))
    };
}

function foreignInputOf(assetId: string, simulated: Simulated, latest: ReadonlyMap<string, string>): ForeignCheckInput {
    return { afterQuantity: simulated.afterQuantities.get(assetId) ?? '0', latestTradeDate: latest.get(assetId) ?? null };
}

@Injectable()
export class ImportLineEvaluatorService {
    public constructor(
        private readonly catalog: AssetCatalogService,
        private readonly operations: PositionOperationsService
    ) {}

    public async evaluate(holderUserId: string | null, edited: readonly EditedLine[]): Promise<Evaluation> {
        const matched: ReadonlyMap<string, Asset> = await this.resolveAssets(edited);
        const candidates: EditedLine[] = edited.filter(
            (item: EditedLine): boolean => !item.skip && matched.has(item.line.lineId) && !hasUnsupportedDirection(item)
        );
        const inputs: Map<string, OperationInput> = inputsOf(candidates, matched);
        const duplicates: ReadonlySet<number> = await this.operations.duplicateLines(holderUserId, [...inputs.values()]);
        const assets: Map<string, Asset> = new Map([...matched.values()].map((asset: Asset): [string, Asset] => [asset.id, asset]));
        const simulated: Simulated = await this.simulateApplied(holderUserId, candidates, inputs, duplicates, assets);
        const latest: Map<string, string> = await this.latestDatesOf(holderUserId, edited, assets);
        const foreignChecks: Map<string, string> = new Map();
        const lines: EvaluatedLine[] = edited.map((item: EditedLine): EvaluatedLine => {
            const facts: LineFacts = factsOf(item, matched.get(item.line.lineId), duplicates, simulated, latest);
            const verdict: LineVerdict = verdictOf(facts);
            if (facts.foreignCheck !== null && APPLICABLE.has(verdict.status)) {
                foreignChecks.set(item.line.lineId, facts.foreignCheck);
            }
            return evaluatedOf(facts, verdict);
        });
        return { lines, effects: simulated.effects, operations: appliedOf(lines, inputs), foreignChecks };
    }

    private async simulateApplied(
        holderUserId: string | null,
        candidates: readonly EditedLine[],
        inputs: ReadonlyMap<string, OperationInput>,
        duplicates: ReadonlySet<number>,
        assets: ReadonlyMap<string, Asset>
    ): Promise<Simulated> {
        const live: OperationInput[] = [...inputs.values()].filter((input: OperationInput): boolean => !duplicates.has(input.lineNumber));
        const first: Simulated = summarize(await this.operations.simulate(holderUserId, live), assets);
        const dropped: ReadonlySet<number> = new Set(
            candidates
                .filter((item: EditedLine): boolean => item.line.check === LINE_REASONS.assumedCost)
                .filter((item: EditedLine): boolean => first.held.has(inputs.get(item.line.lineId)?.assetId ?? ''))
                .map((item: EditedLine): number => item.line.lineNumber)
        );
        if (dropped.size === 0) {
            return first;
        }
        const kept: OperationInput[] = live.filter((input: OperationInput): boolean => !dropped.has(input.lineNumber));
        const second: Simulated = summarize(await this.operations.simulate(holderUserId, kept), assets);
        return withoutDropped(first, second);
    }

    private async latestDatesOf(
        holderUserId: string | null,
        edited: readonly EditedLine[],
        assets: ReadonlyMap<string, Asset>
    ): Promise<Map<string, string>> {
        const foreign: boolean = edited.some((item: EditedLine): boolean => item.line.dollar !== undefined);
        return foreign ? this.operations.latestTradeDates(holderUserId, [...assets.keys()]) : new Map();
    }

    private async resolveAssets(edited: readonly EditedLine[]): Promise<ReadonlyMap<string, Asset>> {
        const byTicker: Map<string, Asset> = await this.assetsByTicker(edited);
        const byId: Map<string, Asset> = await this.assetsById(edited);
        const matched: Map<string, Asset> = new Map();
        for (const item of edited) {
            const asset: Asset | undefined =
                item.assetId === null ? byTicker.get(tickerKeyOf(item.line.market, item.line.ticker)) : byId.get(item.assetId);
            if (asset !== undefined) {
                matched.set(item.line.lineId, asset);
            }
        }
        return matched;
    }

    private async assetsByTicker(edited: readonly EditedLine[]): Promise<Map<string, Asset>> {
        const unresolved: StoredLine[] = edited
            .filter((item: EditedLine): boolean => item.assetId === null)
            .map((item: EditedLine): StoredLine => item.line);
        const b3: Asset[] = await this.catalog.findManyByMarketAndExternalIds(B3_MARKET, tickersOf(unresolved, B3_MARKET));
        const us: Asset[] = await this.catalog.findManyByMarketAndExternalIds(US_MARKET, tickersOf(unresolved, US_MARKET));
        const crypto: Asset[] = await this.catalog.findBestByMarketAndSymbols(CRYPTO_MARKET, tickersOf(unresolved, CRYPTO_MARKET));
        return new Map([
            ...b3.map((asset: Asset): [string, Asset] => [tickerKeyOf(B3_MARKET, asset.externalId), asset]),
            ...us.map((asset: Asset): [string, Asset] => [tickerKeyOf(US_MARKET, asset.externalId), asset]),
            ...crypto.map((asset: Asset): [string, Asset] => [tickerKeyOf(CRYPTO_MARKET, asset.symbol), asset])
        ]);
    }

    private async assetsById(edited: readonly EditedLine[]): Promise<Map<string, Asset>> {
        const ids: string[] = [...new Set(edited.flatMap((item: EditedLine): string[] => (item.assetId === null ? [] : [item.assetId])))];
        const found: Asset[] = await this.catalog.findManyByIds(ids);
        return new Map(found.map((asset: Asset): [string, Asset] => [asset.id, asset]));
    }
}

function inputsOf(candidates: readonly EditedLine[], matched: ReadonlyMap<string, Asset>): Map<string, OperationInput> {
    return new Map(
        candidates.map((item: EditedLine): [string, OperationInput] => [
            item.line.lineId,
            operationOf(item, matched.get(item.line.lineId)?.id ?? '')
        ])
    );
}

function appliedOf(lines: readonly EvaluatedLine[], inputs: ReadonlyMap<string, OperationInput>): OperationInput[] {
    return lines
        .filter((line: EvaluatedLine): boolean => APPLICABLE.has(line.status))
        .flatMap((line: EvaluatedLine): OperationInput[] => {
            const input: OperationInput | undefined = inputs.get(line.lineId);
            return input === undefined ? [] : [input];
        });
}
