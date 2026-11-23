import { ISSUER_KINDS, ISSUER_STATUSES, IssuerGroup, IssuerKind, IssuerRecord } from './issuer.types';

const DIACRITICS: RegExp = /\p{Diacritic}/gu;

export function normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();
}

const RANK_EXACT: number = 0;
const RANK_PREFIX: number = 1;
const RANK_CONTAINS: number = 2;
const RANK_GROUP: number = 3;
const RANK_NONE: number = 4;

function rankOf(candidates: readonly string[], text: string): number {
    if (candidates.includes(text)) {
        return RANK_EXACT;
    }
    if (candidates.some((candidate: string): boolean => candidate.startsWith(text))) {
        return RANK_PREFIX;
    }
    return candidates.some((candidate: string): boolean => candidate.includes(text)) ? RANK_CONTAINS : RANK_NONE;
}

interface Ranked {
    readonly record: IssuerRecord;
    readonly rank: number;
}

function ownNames(record: IssuerRecord): string[] {
    return [record.name, ...record.aliases, record.id].map(normalizeSearchText);
}

function rankRecord(record: IssuerRecord, text: string, groups: ReadonlyMap<string, IssuerGroup>): Ranked {
    const own: number = rankOf(ownNames(record), text);
    if (record.status === ISSUER_STATUSES.retired) {
        return { record, rank: own === RANK_EXACT ? own : RANK_NONE };
    }
    const groupName: string = normalizeSearchText(groups.get(record.groupId)?.name ?? '');
    return { record, rank: own < RANK_NONE ? own : groupRankOf(groupName, text) };
}

function groupRankOf(groupName: string, text: string): number {
    return groupName.includes(text) ? RANK_GROUP : RANK_NONE;
}

function byRelevance(left: Ranked, right: Ranked): number {
    return (
        left.rank - right.rank ||
        Number(left.record.kind === ISSUER_KINDS.other) - Number(right.record.kind === ISSUER_KINDS.other) ||
        left.record.name.localeCompare(right.record.name, 'pt-BR')
    );
}

export function searchIssuers(
    records: Iterable<IssuerRecord>,
    groups: ReadonlyMap<string, IssuerGroup>,
    query: string,
    kind: IssuerKind | null,
    limit: number
): IssuerRecord[] {
    const text: string = normalizeSearchText(query);
    const candidates: IssuerRecord[] = [...records].filter(
        (record: IssuerRecord): boolean =>
            (kind === null || record.kind === kind || record.kind === ISSUER_KINDS.other) &&
            (text !== '' || record.status === ISSUER_STATUSES.active)
    );
    const ranked: Ranked[] = candidates.map((record: IssuerRecord): Ranked => rankRecord(record, text, groups));
    return ranked
        .filter((entry: Ranked): boolean => text === '' || entry.rank < RANK_NONE)
        .sort(byRelevance)
        .slice(0, limit)
        .map((entry: Ranked): IssuerRecord => entry.record);
}
