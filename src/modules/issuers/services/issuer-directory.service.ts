import { Injectable, OnModuleInit } from '@nestjs/common';
import groupsJson from '../data/groups.json';
import institutionsJson from '../data/institutions.json';
import { buildIssuerIndex, IssuerIndex, resolveRecord } from '../domain/issuer-index';
import { issuerFitsTitle } from '../domain/issuer-kind';
import { searchIssuers } from '../domain/issuer-search';
import { Issuer, IssuerGroup, IssuerKind, IssuerRecord, ResolvedIssuer } from '../domain/issuer.types';
import { groupsSchema, institutionsSchema } from '../validation/issuer-data.schemas';
import { IssuersLogService } from './issuers-log.service';

const EMPTY_INDEX: IssuerIndex = { records: new Map<string, IssuerRecord>(), groups: new Map<string, IssuerGroup>() };

@Injectable()
export class IssuerDirectoryService implements OnModuleInit {
    private index: IssuerIndex = EMPTY_INDEX;

    public constructor(private readonly logs: IssuersLogService) {}

    public onModuleInit(): void {
        try {
            this.index = buildIssuerIndex(institutionsSchema.parse(institutionsJson), groupsSchema.parse(groupsJson));
        } catch (error: unknown) {
            this.logs.failed(error);
            throw error;
        }
        this.logs.loaded(this.index.records.size, this.index.groups.size);
    }

    public find(id: string): Issuer | null {
        return this.index.records.get(id) ?? null;
    }

    public resolve(id: string): ResolvedIssuer | null {
        const target: IssuerRecord | null = resolveRecord(id, this.index.records);
        return target === null ? null : { ...target, groupName: this.groupNameOf(target.groupId) };
    }

    public group(groupId: string): IssuerGroup | null {
        return this.index.groups.get(groupId) ?? null;
    }

    public search(query: string, kind: IssuerKind | null, limit: number): readonly ResolvedIssuer[] {
        return searchIssuers(this.index.records.values(), this.index.groups, query, kind, limit).map(
            (record: IssuerRecord): ResolvedIssuer => this.withCurrentGroup(record)
        );
    }

    public accepts(issuer: Issuer, titleKind: string, currency: string): boolean {
        return issuerFitsTitle(issuer, titleKind, currency);
    }

    private withCurrentGroup(record: IssuerRecord): ResolvedIssuer {
        const target: IssuerRecord = resolveRecord(record.id, this.index.records) ?? record;
        return { ...record, groupId: target.groupId, fgcAssociated: target.fgcAssociated, groupName: this.groupNameOf(target.groupId) };
    }

    private groupNameOf(groupId: string): string {
        return this.index.groups.get(groupId)?.name ?? '';
    }
}
