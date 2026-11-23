import { Injectable } from '@nestjs/common';
import { buildConcentration } from '../domain/concentration';
import { Concentration, ConcentrationRow, IssuerRow, UNMAPPED_DIMENSIONS } from '../domain/concentration.types';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ConcentrationLogService } from '../services/concentration-log.service';
import { ConcentrationMetricsService } from '../services/concentration-metrics.service';
import { ConcentrationResponse } from '../validation/concentration.schemas';

@Injectable()
export class ConcentrationApplication {
    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly issuers: IssuerDirectoryService,
        private readonly logs: ConcentrationLogService,
        private readonly metrics: ConcentrationMetricsService
    ) {}

    public async get(): Promise<ConcentrationResponse> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build();
        const concentration: Concentration = buildConcentration({
            holdings: snapshot.holdings,
            classes: snapshot.classes,
            groupName: (groupId: string): string | null => this.issuers.group(groupId)?.name ?? null
        });
        this.report(concentration);
        return {
            asOf: snapshot.asOf,
            baseCurrency: snapshot.baseCurrency as ConcentrationResponse['baseCurrency'],
            totalMinor: concentration.totalMinor,
            equityTotalMinor: concentration.equityTotalMinor,
            byIssuer: concentration.byIssuer.map((row: IssuerRow) => ({ ...row, assets: [...row.assets] })),
            byIssuerOthers: concentration.byIssuerOthers,
            bySector: concentration.bySector.map((row: ConcentrationRow) => ({ ...row, assets: [...row.assets] }))
        };
    }

    private report(concentration: Concentration): void {
        this.metrics.requested();
        this.metrics.unmappedRatio(UNMAPPED_DIMENSIONS.issuer, concentration.unmappedIssuerRatio);
        this.metrics.unmappedRatio(UNMAPPED_DIMENSIONS.sector, concentration.unmappedSectorRatio);
        this.logs.computed(concentration.byIssuer.length + (concentration.byIssuerOthers?.groups ?? 0), concentration.unmappedHoldings);
    }
}
