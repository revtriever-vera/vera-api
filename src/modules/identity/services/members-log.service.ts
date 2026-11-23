import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const INVITE: string = 'members-invite';
const CHANGE: string = 'members-change';
const DEPARTURE: string = 'members-departure';

@Injectable()
export class MembersLogService {
    public constructor(private readonly logService: LogService) {}

    public invited(inviteId: string, role: string): void {
        this.logService.info({ message: 'invite sent', identifier: INVITE, meta: { action: 'invited', inviteId, role } });
    }

    public resent(inviteId: string, role: string): void {
        this.logService.info({ message: 'invite resent', identifier: INVITE, meta: { action: 'resent', inviteId, role } });
    }

    public revoked(inviteId: string, role: string): void {
        this.logService.info({ message: 'invite revoked', identifier: INVITE, meta: { action: 'revoked', inviteId, role } });
    }

    public accepted(inviteId: string, role: string): void {
        this.logService.info({ message: 'invite accepted', identifier: INVITE, meta: { action: 'accepted', inviteId, role } });
    }

    public emailMismatch(inviteId: string): void {
        this.logService.warn({ message: 'invite email mismatch', identifier: INVITE, meta: { action: 'email_mismatch', inviteId } });
    }

    public accountNotEmpty(inviteId: string): void {
        this.logService.warn({
            message: 'invite refused account not empty',
            identifier: INVITE,
            meta: { action: 'account_not_empty', inviteId }
        });
    }

    public roleChanged(userId: string, from: string, to: string): void {
        this.logService.info({ message: 'member role changed', identifier: CHANGE, meta: { action: 'role_changed', userId, from, to } });
    }

    public removed(userId: string): void {
        this.logService.info({ message: 'member removed', identifier: CHANGE, meta: { action: 'removed', userId } });
    }

    public left(userId: string): void {
        this.logService.info({ message: 'member left', identifier: CHANGE, meta: { action: 'left', userId } });
    }

    public anonymized(count: number): void {
        this.logService.info({ message: 'removed people anonymized', identifier: CHANGE, meta: { action: 'anonymized', count } });
    }

    public departureFailed(area: string, userId: string, error: unknown): void {
        this.logService.error({
            message: 'member departure port failed',
            identifier: DEPARTURE,
            meta: { area, userId, errorName: error instanceof Error ? error.name : typeof error }
        });
    }
}
