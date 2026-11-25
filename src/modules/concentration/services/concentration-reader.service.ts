import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { buildConcentration } from '../domain/concentration';
import { Concentration, ConcentrationRow, IssuerRow } from '../domain/concentration.types';
import { ConcentrationResponse } from '../validation/concentration.schemas';

export type { ConcentrationResponse };

export interface ConcentrationReading {
    readonly response: ConcentrationResponse;
    readonly concentration: Concentration;
}

@Injectable()
export class ConcentrationReaderService {
    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly issuers: IssuerDirectoryService
    ) {}

    public async read(): Promise<ConcentrationReading> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build(ANY_HOLDER);
        const concentration: Concentration = buildConcentration({
            holdings: snapshot.holdings,
            classes: snapshot.classes,
            groupName: (groupId: string): string | null => this.issuers.group(groupId)?.name ?? null
        });
        const response: ConcentrationResponse = {
            asOf: snapshot.asOf,
            baseCurrency: snapshot.baseCurrency as ConcentrationResponse['baseCurrency'],
            totalMinor: concentration.totalMinor,
            equityTotalMinor: concentration.equityTotalMinor,
            byIssuer: concentration.byIssuer.map((row: IssuerRow) => ({ ...row, assets: [...row.assets] })),
            byIssuerOthers: concentration.byIssuerOthers,
            bySector: concentration.bySector.map((row: ConcentrationRow) => ({ ...row, assets: [...row.assets] }))
        };
        return { response, concentration };
    }
}
