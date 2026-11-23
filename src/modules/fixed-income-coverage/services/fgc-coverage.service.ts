import { Injectable } from '@nestjs/common';
import { ANY_HOLDER, HolderFilter } from '../../../shared/holder/holder-filter';
import { FixedIncomeValuationService, ValuedTitle } from '../../fixed-income/services/fixed-income-valuation.service';
import { ScheduleSourceService, ScheduleTreasury } from '../../fixed-income-schedule/services/schedule-source.service';
import { IssuerDirectoryService, ResolvedIssuer } from '../../issuers/services/issuer-directory.service';
import { computeCoverage, FgcResult, simulate } from '../domain/fgc-rule';
import { FGC_CURRENCY } from '../domain/fgc.constants';
import { FgcIssuerKindMismatchError, FgcUnknownIssuerError } from '../domain/fgc.errors';
import { FgcCoverage, FgcHolderBlock, FgcHolding, FgcIssuer, FgcSimulation, FgcSimulationInput } from '../domain/fgc.types';

const NO_ISSUER: null = null;

/** Reads the portfolio once (one valuation, like GET /portfolio/holdings) and applies the pure FGC rule. */
@Injectable()
export class FgcCoverageService {
    public constructor(
        private readonly valuation: FixedIncomeValuationService,
        private readonly source: ScheduleSourceService,
        private readonly issuers: IssuerDirectoryService
    ) {}

    public async coverage(filter: HolderFilter): Promise<FgcCoverage> {
        const now: Date = new Date();
        const asOf: string = FixedIncomeValuationService.referenceDate(now);
        const byHolder: Map<string | null, FgcHolding[]> = new Map<string | null, FgcHolding[]>();
        for (const holding of await this.holdings(now, asOf, filter)) {
            byHolder.set(holding.holderUserId, [...(byHolder.get(holding.holderUserId) ?? []), holding]);
        }
        return {
            asOf,
            blocks: [...byHolder].map(([holderUserId, holdings]: [string | null, FgcHolding[]]): FgcHolderBlock =>
                this.blockOf(holderUserId, holdings)
            )
        };
    }

    public async simulate(input: FgcSimulationInput): Promise<FgcSimulation> {
        const issuer: ResolvedIssuer | null = this.issuers.resolve(input.issuerId);
        if (issuer === null) {
            throw new FgcUnknownIssuerError(input.issuerId);
        }
        if (!this.issuers.accepts(issuer, input.kind, FGC_CURRENCY)) {
            throw new FgcIssuerKindMismatchError(input.kind, issuer.kind);
        }
        const now: Date = new Date();
        const holdings: FgcHolding[] = await this.holdings(now, FixedIncomeValuationService.referenceDate(now), ANY_HOLDER);
        return simulate(holdings, {
            issuer: this.issuerOf(issuer),
            kind: input.kind,
            valueMinor: input.valueMinor,
            excludeTitleId: input.excludeTitleId
        });
    }

    private async holdings(now: Date, today: string, filter: HolderFilter): Promise<FgcHolding[]> {
        const [titles, treasuries]: [readonly ValuedTitle[], readonly ScheduleTreasury[]] = await Promise.all([
            this.valuation.valueAll(now, filter),
            this.source.loadTreasuries(filter)
        ]);
        return [
            ...titles.map((entry: ValuedTitle): FgcHolding => this.titleHolding(entry)),
            ...treasuries.map((treasury: ScheduleTreasury): FgcHolding => this.treasuryHolding(treasury, today))
        ];
    }

    private titleHolding(entry: ValuedTitle): FgcHolding {
        const issuerId: string | null = entry.title.issuerId;
        const issuer: ResolvedIssuer | null = issuerId === null ? NO_ISSUER : this.issuers.resolve(issuerId);
        return {
            id: entry.title.id,
            name: entry.title.name,
            kind: entry.title.kind,
            currency: entry.title.currency,
            valueMinor: entry.valuation.valueMinor,
            estimated: entry.valuation.estimated || entry.valuation.status === 'index_data_missing',
            matured: entry.valuation.matured,
            treasury: false,
            holderUserId: entry.title.holderUserId,
            issuer: issuer === null ? NO_ISSUER : this.issuerOf(issuer)
        };
    }

    private treasuryHolding(treasury: ScheduleTreasury, today: string): FgcHolding {
        return {
            id: treasury.id,
            name: treasury.name,
            kind: null,
            currency: FGC_CURRENCY,
            valueMinor: treasury.valueTodayMinor ?? 0,
            estimated: treasury.valueTodayMinor === null,
            matured: treasury.maturityDate < today,
            treasury: true,
            holderUserId: treasury.holderUserId,
            issuer: NO_ISSUER
        };
    }

    private blockOf(holderUserId: string | null, holdings: readonly FgcHolding[]): FgcHolderBlock {
        const result: FgcResult = computeCoverage(holdings);
        return {
            holderUserId,
            coveredMinor: result.coveredMinor,
            capShareBps: result.capShareBps,
            groups: result.groups,
            outside: result.outside
        };
    }

    private issuerOf(issuer: ResolvedIssuer): FgcIssuer {
        return {
            name: issuer.name,
            groupId: issuer.groupId,
            groupName: issuer.groupName,
            kind: issuer.kind,
            fgcAssociated: issuer.fgcAssociated
        };
    }
}
