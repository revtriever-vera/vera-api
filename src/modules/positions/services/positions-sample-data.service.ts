import { Injectable } from '@nestjs/common';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { SampleDataPort } from '../../onboarding/services/sample-data.port';
import { PositionDomain } from '../domain/position.domain';
import { POSITION_SUBJECT_TYPE, Position } from '../domain/positions.types';

type SampleMarket = Parameters<AssetCatalogService['findByMarketAndExternalId']>[0];

interface SamplePosition {
    readonly market: SampleMarket;
    readonly externalId: string;
    readonly quantity: string;
    readonly averagePrice: string;
}

export const SAMPLE_POSITIONS: readonly SamplePosition[] = [
    { market: 'B3', externalId: 'ITUB4', quantity: '200', averagePrice: '32.5' },
    { market: 'B3', externalId: 'WEGE3', quantity: '100', averagePrice: '48' },
    { market: 'B3', externalId: 'HGLG11', quantity: '30', averagePrice: '155' },
    { market: 'US', externalId: 'VOO', quantity: '5', averagePrice: '480' }
];

@Injectable()
export class PositionsSampleDataService extends SampleDataPort {
    public readonly area: string = 'positions';

    public constructor(
        private readonly positions: PositionDomain,
        private readonly catalog: AssetCatalogService,
        private readonly assignments: ClassAssignmentService,
        private readonly resolver: ClassResolverService
    ) {
        super();
    }

    public async seed(): Promise<number> {
        if ((await this.positions.countReal()) > 0 || (await this.positions.hasSamples())) {
            return 0;
        }
        let seeded: number = 0;
        for (const sample of SAMPLE_POSITIONS) {
            const asset: Asset | null = await this.catalog.findByMarketAndExternalId(sample.market, sample.externalId);
            if (asset !== null && (await this.seedOne(asset, sample))) {
                seeded += 1;
            }
        }
        return seeded;
    }

    public async clear(): Promise<number> {
        const removed: Position[] = await this.positions.removeSamples();
        for (const position of removed) {
            await this.assignments.release(POSITION_SUBJECT_TYPE, position.id);
        }
        return removed.length;
    }

    private async seedOne(asset: Asset, sample: SamplePosition): Promise<boolean> {
        if (asset.suggestedClassKey === null) {
            return false;
        }
        const created: Position | null = await this.positions.createIfAbsent({
            assetId: asset.id,
            quantity: sample.quantity,
            averagePrice: sample.averagePrice,
            isSample: true
        });
        if (created === null) {
            return false;
        }
        await this.assignments.assign(
            POSITION_SUBJECT_TYPE,
            created.id,
            (await this.resolver.resolveBySystemKey(asset.suggestedClassKey)).id,
            true
        );
        return true;
    }
}
