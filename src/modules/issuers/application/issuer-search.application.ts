import { Injectable } from '@nestjs/common';
import { ISSUER_SEARCH_LIMIT, ResolvedIssuer } from '../domain/issuer.types';
import { IssuerDirectoryService } from '../services/issuer-directory.service';
import { IssuersMetricsService } from '../services/issuers-metrics.service';
import { IssuerItem, IssuerSearchQuery, IssuerSearchResponse } from '../validation/issuers.schemas';

const ANY_KIND: string = 'any';

@Injectable()
export class IssuerSearchApplication {
    public constructor(
        private readonly directory: IssuerDirectoryService,
        private readonly metrics: IssuersMetricsService
    ) {}

    public search(query: IssuerSearchQuery): IssuerSearchResponse {
        this.metrics.search(query.kind ?? ANY_KIND);
        const found: readonly ResolvedIssuer[] = this.directory.search(query.q ?? '', query.kind ?? null, ISSUER_SEARCH_LIMIT);
        return {
            items: found.map((issuer: ResolvedIssuer): IssuerItem => ({
                id: issuer.id,
                name: issuer.name,
                groupId: issuer.groupId,
                groupName: issuer.groupName,
                kind: issuer.kind,
                fgcAssociated: issuer.fgcAssociated,
                status: issuer.status
            }))
        };
    }
}
