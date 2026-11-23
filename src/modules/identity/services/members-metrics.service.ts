import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { InviteOutcome, MemberChangeKind } from '../domain/identity.types';

const INVITES_TOTAL: string = 'vera_invites_total';
const MEMBER_CHANGES_TOTAL: string = 'vera_members_changes_total';

@Injectable()
export class MembersMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public invite(outcome: InviteOutcome): void {
        this.metrics.count(INVITES_TOTAL, { outcome });
    }

    public change(kind: MemberChangeKind): void {
        this.metrics.count(MEMBER_CHANGES_TOTAL, { kind });
    }
}
