import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../../core/llm/llm.types';
import { IdUtil } from '../../../shared/utils/id.util';
import { WhatsAppPendingActionsRepository } from '../repositories/whatsapp-pending-actions.repository';
import { MINUTE_MS, PENDING_TTL_MINUTES, PendingAction, PendingKind, PendingResolution } from './whatsapp-chat.types';

@Injectable()
export class PendingActionDomain {
    public constructor(private readonly pending: WhatsAppPendingActionsRepository) {}

    public async propose(linkId: string, kind: PendingKind, payload: JsonObject, now: Date): Promise<PendingAction> {
        return this.pending.create({
            id: IdUtil.newId(),
            linkId,
            kind,
            payload: JSON.stringify(payload),
            expiresAt: new Date(now.getTime() + PENDING_TTL_MINUTES * MINUTE_MS)
        });
    }

    public async ofLink(id: string, linkId: string): Promise<PendingAction | null> {
        return this.pending.findOfLink(id, linkId);
    }

    public async latestOpen(linkId: string, now: Date): Promise<PendingAction | null> {
        return this.pending.findLatestOpen(linkId, now);
    }

    public async latestUnresolved(linkId: string): Promise<PendingAction | null> {
        return this.pending.findLatest(linkId);
    }

    public async resolve(id: string, resolution: PendingResolution, now: Date): Promise<PendingAction | null> {
        return this.pending.resolveOpen(id, resolution, now);
    }
}
