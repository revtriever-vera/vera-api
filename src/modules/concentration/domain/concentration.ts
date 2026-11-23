import { sharesBpsOf } from '../../portfolio/services/portfolio-snapshot.service';
import {
    ASSET_NAMES_LIMIT,
    ClassInput,
    Concentration,
    ConcentrationRow,
    HoldingInput,
    IssuerKey,
    IssuerOthers,
    IssuerRow,
    TOP_ISSUERS_LIMIT,
    UNMAPPED_SECTOR
} from './concentration.types';
import { isUnmappedIssuerKey, issuerKeyOf } from './issuer-bucket';
import { sectorKeyOf } from './sector-bucket';

export interface ConcentrationInput {
    readonly holdings: readonly HoldingInput[];
    readonly classes: readonly ClassInput[];
    readonly groupName: (groupId: string) => string | null;
}

interface Slice {
    readonly key: IssuerKey;
    readonly holding: HoldingInput;
}

interface Group {
    readonly key: IssuerKey;
    readonly valueMinor: number;
    readonly holdings: readonly HoldingInput[];
}

function isIncluded(holding: HoldingInput): boolean {
    return holding.valueMinor > 0 && !holding.isZeroQuantity && !holding.matured;
}

function byValueDescending(left: HoldingInput, right: HoldingInput): number {
    return right.valueMinor - left.valueMinor || left.symbol.localeCompare(right.symbol);
}

function groupsOf(slices: readonly Slice[]): Group[] {
    const grouped: Map<string, Slice[]> = new Map<string, Slice[]>();
    for (const slice of slices) {
        grouped.set(slice.key.key, [...(grouped.get(slice.key.key) ?? []), slice]);
    }
    return [...grouped.values()]
        .map((members: Slice[]): Group => ({
            key: (members[0] as Slice).key,
            valueMinor: members.reduce((total: number, member: Slice): number => total + member.holding.valueMinor, 0),
            holdings: members.map((member: Slice): HoldingInput => member.holding).sort(byValueDescending)
        }))
        .sort((left: Group, right: Group): number => right.valueMinor - left.valueMinor || left.key.key.localeCompare(right.key.key));
}

function totalOf(groups: readonly Group[]): number {
    return groups.reduce((total: number, group: Group): number => total + group.valueMinor, 0);
}

function rowOf(group: Group, shareBps: number): ConcentrationRow {
    return {
        key: group.key.key,
        valueMinor: group.valueMinor,
        shareBps,
        assets: group.holdings.slice(0, ASSET_NAMES_LIMIT).map((holding: HoldingInput): string => holding.symbol),
        moreCount: Math.max(group.holdings.length - ASSET_NAMES_LIMIT, 0)
    };
}

function sharesOf(groups: readonly Group[], totalMinor: number): number[] {
    return sharesBpsOf(
        groups.map((group: Group): number => group.valueMinor),
        totalMinor
    );
}

function issuerRowOf(row: ConcentrationRow, key: IssuerKey, input: ConcentrationInput): IssuerRow {
    return { ...row, kind: key.kind, name: key.kind === 'group' ? (input.groupName(key.key) ?? key.key) : null };
}

function othersOf(rest: readonly Group[], shares: readonly number[]): IssuerOthers | null {
    if (rest.length === 0) {
        return null;
    }
    return {
        valueMinor: totalOf(rest),
        shareBps: shares.reduce((total: number, share: number): number => total + share, 0),
        groups: rest.length
    };
}

function ratioOf(part: number, total: number): number {
    return total > 0 ? part / total : 0;
}

function valueOfKeys(groups: readonly Group[], isUnmapped: (key: string) => boolean): number {
    return totalOf(groups.filter((group: Group): boolean => isUnmapped(group.key.key)));
}

function sectorSlices(holdings: readonly HoldingInput[], input: ConcentrationInput): Slice[] {
    const classes: Map<string, ClassInput> = new Map(input.classes.map((item: ClassInput): [string, ClassInput] => [item.classId, item]));
    return holdings.flatMap((holding: HoldingInput): Slice[] => {
        const sector: string | null = sectorKeyOf(holding, classes);
        return sector === null ? [] : [{ key: { key: sector, kind: 'bucket' }, holding }];
    });
}

type IssuerBlock = Pick<Concentration, 'totalMinor' | 'byIssuer' | 'byIssuerOthers' | 'unmappedHoldings' | 'unmappedIssuerRatio'>;
type SectorBlock = Pick<Concentration, 'equityTotalMinor' | 'bySector' | 'unmappedSectorRatio'>;

function issuerBlockOf(issuers: readonly Group[], input: ConcentrationInput): IssuerBlock {
    const totalMinor: number = totalOf(issuers);
    const shares: number[] = sharesOf(issuers, totalMinor);
    const top: Group[] = issuers.slice(0, TOP_ISSUERS_LIMIT);
    return {
        totalMinor,
        byIssuer: top.map((group: Group, index: number): IssuerRow => issuerRowOf(rowOf(group, shares[index] ?? 0), group.key, input)),
        byIssuerOthers: othersOf(issuers.slice(TOP_ISSUERS_LIMIT), shares.slice(TOP_ISSUERS_LIMIT)),
        unmappedHoldings: issuers
            .filter((group: Group): boolean => isUnmappedIssuerKey(group.key.key))
            .reduce((count: number, group: Group): number => count + group.holdings.length, 0),
        unmappedIssuerRatio: ratioOf(valueOfKeys(issuers, isUnmappedIssuerKey), totalMinor)
    };
}

function sectorBlockOf(sectors: readonly Group[]): SectorBlock {
    const equityTotalMinor: number = totalOf(sectors);
    const shares: number[] = sharesOf(sectors, equityTotalMinor);
    return {
        equityTotalMinor,
        bySector: sectors.map((group: Group, index: number): ConcentrationRow => rowOf(group, shares[index] ?? 0)),
        unmappedSectorRatio: ratioOf(
            valueOfKeys(sectors, (key: string): boolean => key === UNMAPPED_SECTOR),
            equityTotalMinor
        )
    };
}

export function buildConcentration(input: ConcentrationInput): Concentration {
    const included: HoldingInput[] = input.holdings.filter(isIncluded);
    const issuers: Group[] = groupsOf(included.map((holding: HoldingInput): Slice => ({ key: issuerKeyOf(holding), holding })));
    const sectors: Group[] = groupsOf(sectorSlices(included, input));
    return { ...issuerBlockOf(issuers, input), ...sectorBlockOf(sectors) };
}
