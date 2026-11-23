import { IssuerDataInvalidError } from './issuers.errors';
import { ISSUER_KINDS, ISSUER_STATUSES, IssuerGroup, IssuerRecord, SOVEREIGN_ISSUER_IDS } from './issuer.types';

export interface IssuerIndex {
    readonly records: ReadonlyMap<string, IssuerRecord>;
    readonly groups: ReadonlyMap<string, IssuerGroup>;
}

function assertSortedAndUnique(ids: readonly string[], subject: string): void {
    ids.forEach((id: string, position: number): void => {
        const previous: string | undefined = ids[position - 1];
        if (previous !== undefined && previous >= id) {
            throw new IssuerDataInvalidError(previous === id ? 'duplicated_id' : 'not_sorted', `${subject}:${id}`);
        }
    });
}

function assertGroupsExist(records: readonly IssuerRecord[], groups: ReadonlyMap<string, IssuerGroup>): void {
    for (const record of records) {
        if (!groups.has(record.groupId)) {
            throw new IssuerDataInvalidError('unknown_group', record.id);
        }
    }
}

function assertMergeTargets(records: ReadonlyMap<string, IssuerRecord>): void {
    for (const record of records.values()) {
        const retired: boolean = record.status === ISSUER_STATUSES.retired;
        if (record.mergedInto !== null && (!retired || !records.has(record.mergedInto) || record.mergedInto === record.id)) {
            throw new IssuerDataInvalidError('invalid_merged_into', record.id);
        }
        assertNoCycle(record, records);
    }
}

function assertNoCycle(start: IssuerRecord, records: ReadonlyMap<string, IssuerRecord>): void {
    const seen: Set<string> = new Set<string>([start.id]);
    let current: IssuerRecord | null = start;
    while (current !== null && current.mergedInto !== null) {
        current = records.get(current.mergedInto) ?? null;
        if (current !== null && seen.has(current.id)) {
            throw new IssuerDataInvalidError('merge_cycle', start.id);
        }
        if (current !== null) {
            seen.add(current.id);
        }
    }
}

function assertSovereigns(records: ReadonlyMap<string, IssuerRecord>): void {
    for (const id of Object.values(SOVEREIGN_ISSUER_IDS)) {
        const record: IssuerRecord | undefined = records.get(id);
        if (record?.kind !== ISSUER_KINDS.sovereign || record.groupId !== id) {
            throw new IssuerDataInvalidError('missing_sovereign', id);
        }
    }
}

export function buildIssuerIndex(institutions: readonly IssuerRecord[], groups: readonly IssuerGroup[]): IssuerIndex {
    assertSortedAndUnique(
        institutions.map((record: IssuerRecord): string => record.id),
        'institution'
    );
    assertSortedAndUnique(
        groups.map((group: IssuerGroup): string => group.id),
        'group'
    );
    const groupMap: ReadonlyMap<string, IssuerGroup> = new Map(
        groups.map((group: IssuerGroup): [string, IssuerGroup] => [group.id, group])
    );
    assertGroupsExist(institutions, groupMap);
    const records: ReadonlyMap<string, IssuerRecord> = new Map(
        institutions.map((record: IssuerRecord): [string, IssuerRecord] => [record.id, record])
    );
    assertMergeTargets(records);
    assertSovereigns(records);
    return { records, groups: groupMap };
}

export function assertKnownIdsKept(known: readonly string[], records: ReadonlyMap<string, IssuerRecord>): void {
    for (const id of known) {
        if (!records.has(id)) {
            throw new IssuerDataInvalidError('known_id_removed', id);
        }
    }
}

export function resolveRecord(id: string, records: ReadonlyMap<string, IssuerRecord>): IssuerRecord | null {
    let current: IssuerRecord | null = records.get(id) ?? null;
    while (current !== null && current.mergedInto !== null) {
        current = records.get(current.mergedInto) ?? null;
    }
    return current;
}
