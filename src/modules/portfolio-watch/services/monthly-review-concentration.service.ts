import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { ConcentrationReaderService } from '../../concentration/services/concentration-reader.service';
import { FgcCoverageService } from '../../fixed-income-coverage/services/fgc-coverage.service';
import { MonthlyReview } from '../validation/monthly-review.schemas';

export const TOP_ISSUERS_IN_REVIEW: number = 5;

type ConcentrationBlock = MonthlyReview['concentration'];
type FgcGroupRow = ConcentrationBlock['fgcExposure']['groups'][number];

interface FgcGroupLike {
    readonly groupId: string;
    readonly groupName: string;
    readonly overMinor: number;
}

function overLimitGroups(blocks: readonly { readonly groups: readonly FgcGroupLike[] }[]): FgcGroupRow[] {
    const byGroup: Map<string, FgcGroupRow> = new Map();
    for (const group of blocks.flatMap((block) => block.groups)) {
        const previous: FgcGroupRow | undefined = byGroup.get(group.groupId);
        if (group.overMinor > 0) {
            byGroup.set(group.groupId, {
                groupId: group.groupId,
                groupName: group.groupName,
                overMinor: (previous?.overMinor ?? 0) + group.overMinor
            });
        }
    }
    return [...byGroup.values()];
}

@Injectable()
export class MonthlyReviewConcentrationService {
    public constructor(
        private readonly concentration: ConcentrationReaderService,
        private readonly fgc: FgcCoverageService
    ) {}

    public async read(): Promise<ConcentrationBlock> {
        const reading: Awaited<ReturnType<ConcentrationReaderService['read']>> = await this.concentration.read();
        const coverage: Awaited<ReturnType<FgcCoverageService['coverage']>> = await this.fgc.coverage(ANY_HOLDER);
        const groups: FgcGroupRow[] = overLimitGroups(coverage.blocks);
        return {
            topIssuers: reading.response.byIssuer.slice(0, TOP_ISSUERS_IN_REVIEW).map((row) => ({
                key: row.key,
                name: row.name,
                valueMinor: row.valueMinor,
                shareBps: row.shareBps
            })),
            sectors: reading.response.bySector.map((row) => ({ key: row.key, valueMinor: row.valueMinor, shareBps: row.shareBps })),
            fgcExposure: {
                overLimitMinor: groups.reduce((total: number, group: FgcGroupRow): number => total + group.overMinor, 0),
                groups
            }
        };
    }
}
