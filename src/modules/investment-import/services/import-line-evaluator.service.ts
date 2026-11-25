import { Injectable } from '@nestjs/common';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { AssetSimulation, OperationInput, PositionOperationsService } from '../../positions/services/position-operations.service';
import { B3_MARKET, EditedLine, EffectLine, EvaluatedLine, LINE_STATUSES } from '../domain/investment-import.types';
import { balanceViewOf, evaluatedOf, hasUnsupportedDirection, LineFacts, verdictOf } from '../domain/line-evaluation';
import { operationOf } from './import-operation.builder';

export interface Evaluation {
    readonly lines: readonly EvaluatedLine[];
    readonly effects: readonly EffectLine[];
    readonly operations: readonly OperationInput[];
}

interface Simulated {
    readonly failures: ReadonlyMap<number, string>;
    readonly held: ReadonlySet<string>;
    readonly effects: readonly EffectLine[];
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
    return { failures, held, effects };
}

function factsOf(item: EditedLine, asset: Asset | undefined, duplicates: ReadonlySet<number>, simulated: Simulated): LineFacts {
    const assetId: string | null = asset?.id ?? null;
    return {
        edited: item,
        assetId,
        duplicate: duplicates.has(item.line.lineNumber),
        failure: simulated.failures.get(item.line.lineNumber) ?? null,
        hasPosition: assetId !== null && simulated.held.has(assetId)
    };
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
        const inputs: Map<string, OperationInput> = new Map(
            candidates.map((item: EditedLine): [string, OperationInput] => [
                item.line.lineId,
                operationOf(item, matched.get(item.line.lineId)?.id ?? '')
            ])
        );
        const duplicates: ReadonlySet<number> = await this.operations.duplicateLines(holderUserId, [...inputs.values()]);
        const live: OperationInput[] = [...inputs.values()].filter((input: OperationInput): boolean => !duplicates.has(input.lineNumber));
        const assets: Map<string, Asset> = new Map([...matched.values()].map((asset: Asset): [string, Asset] => [asset.id, asset]));
        const simulated: Simulated = summarize(await this.operations.simulate(holderUserId, live), assets);
        const lines: EvaluatedLine[] = edited.map((item: EditedLine): EvaluatedLine => {
            const facts: LineFacts = factsOf(item, matched.get(item.line.lineId), duplicates, simulated);
            return evaluatedOf(facts, verdictOf(facts));
        });
        return { lines, effects: simulated.effects, operations: appliedOf(lines, inputs) };
    }

    private async resolveAssets(edited: readonly EditedLine[]): Promise<ReadonlyMap<string, Asset>> {
        const byTicker: Map<string, Asset> = await this.assetsByTicker(edited);
        const byId: Map<string, Asset> = await this.assetsById(edited);
        const matched: Map<string, Asset> = new Map();
        for (const item of edited) {
            const asset: Asset | undefined = item.assetId === null ? byTicker.get(item.line.ticker) : byId.get(item.assetId);
            if (asset !== undefined) {
                matched.set(item.line.lineId, asset);
            }
        }
        return matched;
    }

    private async assetsByTicker(edited: readonly EditedLine[]): Promise<Map<string, Asset>> {
        const tickers: string[] = [
            ...new Set(
                edited.filter((item: EditedLine): boolean => item.assetId === null).map((item: EditedLine): string => item.line.ticker)
            )
        ];
        const found: Asset[] = await this.catalog.findManyByMarketAndExternalIds(B3_MARKET, tickers);
        return new Map(found.map((asset: Asset): [string, Asset] => [asset.externalId, asset]));
    }

    private async assetsById(edited: readonly EditedLine[]): Promise<Map<string, Asset>> {
        const ids: string[] = [...new Set(edited.flatMap((item: EditedLine): string[] => (item.assetId === null ? [] : [item.assetId])))];
        const found: Asset[] = await this.catalog.findManyByIds(ids);
        return new Map(found.map((asset: Asset): [string, Asset] => [asset.id, asset]));
    }
}

function appliedOf(lines: readonly EvaluatedLine[], inputs: ReadonlyMap<string, OperationInput>): OperationInput[] {
    return lines
        .filter((line: EvaluatedLine): boolean => APPLICABLE.has(line.status))
        .flatMap((line: EvaluatedLine): OperationInput[] => {
            const input: OperationInput | undefined = inputs.get(line.lineId);
            return input === undefined ? [] : [input];
        });
}
