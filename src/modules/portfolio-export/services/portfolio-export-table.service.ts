import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { DirectoryMember, MemberDirectoryService } from '../../identity/services/member-directory.service';
import { IssuerDirectoryService, ResolvedIssuer } from '../../issuers/services/issuer-directory.service';
import { Holding, PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { buildExportTable } from '../domain/export-rows';
import { ExportIssuerInput, ExportSnapshotInput, ExportTable } from '../domain/export.types';

@Injectable()
export class PortfolioExportTableService {
    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly context: AppContext,
        private readonly issuers: IssuerDirectoryService,
        private readonly members: MemberDirectoryService
    ) {}

    public async build(excludeSamples: boolean = false): Promise<ExportTable> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build(ANY_HOLDER);
        const holdings: readonly Holding[] = excludeSamples
            ? snapshot.holdings.filter((holding: Holding): boolean => !holding.isSample)
            : snapshot.holdings;
        return buildExportTable(this.inputOf(snapshot, holdings, await this.members.list()), this.context.get().locale);
    }

    private inputOf(snapshot: PortfolioSnapshot, holdings: readonly Holding[], members: readonly DirectoryMember[]): ExportSnapshotInput {
        const issuers: Map<string, ExportIssuerInput> = new Map<string, ExportIssuerInput>();
        for (const holding of holdings) {
            this.addIssuer(issuers, holding);
        }
        return {
            baseCurrency: snapshot.baseCurrency,
            holdings,
            classes: snapshot.classes,
            issuers,
            holders: new Map(members.map((member: DirectoryMember): [string, string] => [member.userId, member.name]))
        };
    }

    private addIssuer(issuers: Map<string, ExportIssuerInput>, holding: Holding): void {
        const stored: ReturnType<IssuerDirectoryService['find']> = holding.issuerId === null ? null : this.issuers.find(holding.issuerId);
        const current: ResolvedIssuer | null = stored === null ? null : this.issuers.resolve(stored.id);
        if (stored !== null && current !== null) {
            issuers.set(stored.id, { name: stored.name, groupName: current.groupName });
        }
    }
}
