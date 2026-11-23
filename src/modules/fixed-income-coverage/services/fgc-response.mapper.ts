import { HolderFilter, HOLDER_FILTER_KINDS } from '../../../shared/holder/holder-filter';
import { DirectoryMember } from '../../identity/services/member-directory.service';
import { FGC_CAP_MINOR, FGC_LIMIT_PER_GROUP_MINOR } from '../domain/fgc.constants';
import { FgcCoverage, FgcGroup, FgcHolderBlock } from '../domain/fgc.types';
import { FgcResponse } from '../validation/fgc.schemas';

type HolderBlockResponse = FgcResponse['byHolder'][number];

type GroupResponse = FgcResponse['groups'][number];

function groupsOf(groups: readonly FgcGroup[]): GroupResponse[] {
    return groups.map((group: FgcGroup): GroupResponse => ({ ...group, titles: [...group.titles] }));
}

const EMPTY_BLOCK: FgcHolderBlock = { holderUserId: null, coveredMinor: 0, capShareBps: 0, groups: [], outside: [] };

function blockResponseOf(block: FgcHolderBlock, members: readonly DirectoryMember[]): HolderBlockResponse {
    const holder: DirectoryMember | undefined = members.find((member: DirectoryMember): boolean => member.userId === block.holderUserId);
    return {
        holder: holder === undefined ? null : { userId: holder.userId, name: holder.name },
        coveredMinor: block.coveredMinor,
        capShareBps: block.capShareBps,
        groups: groupsOf(block.groups),
        outside: [...block.outside]
    };
}

function positionOf(block: FgcHolderBlock, members: readonly DirectoryMember[]): number {
    return members.findIndex((member: DirectoryMember): boolean => member.userId === block.holderUserId);
}

function orderedBlocks(coverage: FgcCoverage, members: readonly DirectoryMember[]): FgcHolderBlock[] {
    return [...coverage.blocks].sort((a: FgcHolderBlock, b: FgcHolderBlock): number => positionOf(a, members) - positionOf(b, members));
}

export function toFgcResponse(coverage: FgcCoverage, filter: HolderFilter, members: readonly DirectoryMember[]): FgcResponse {
    const blocks: FgcHolderBlock[] = orderedBlocks(coverage, members);
    const split: boolean = filter.kind === HOLDER_FILTER_KINDS.any && blocks.length >= 2;
    const single: FgcHolderBlock = blocks[0] ?? EMPTY_BLOCK;
    return {
        currency: 'BRL',
        scope: filter.kind === HOLDER_FILTER_KINDS.any ? 'account' : 'holder',
        peopleCount: members.length,
        limitPerGroupMinor: FGC_LIMIT_PER_GROUP_MINOR,
        capMinor: FGC_CAP_MINOR,
        coveredMinor: split
            ? blocks.reduce((sum: number, block: FgcHolderBlock): number => sum + block.coveredMinor, 0)
            : single.coveredMinor,
        capShareBps: split ? Math.max(...blocks.map((block: FgcHolderBlock): number => block.capShareBps)) : single.capShareBps,
        groups: split ? [] : groupsOf(single.groups),
        outside: split ? [] : [...single.outside],
        byHolder: split ? blocks.map((block: FgcHolderBlock): HolderBlockResponse => blockResponseOf(block, members)) : [],
        asOf: coverage.asOf
    };
}
