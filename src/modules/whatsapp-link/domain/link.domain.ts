import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import { WhatsAppLinksRepository } from '../repositories/whatsapp-links.repository';
import { LINK_STATUSES, LinkStatus, OPT_IN_SOURCES, StaleLinkRef, StatusCount, UnlinkReason, WhatsAppLink } from './whatsapp-link.types';

export type NewLink = {
    readonly userId: string;
    readonly phoneSealed: string;
    readonly phoneHash: string;
    readonly phoneLast4: string;
};

@Injectable()
export class LinkDomain {
    public constructor(private readonly links: WhatsAppLinksRepository) {}

    public async createActive(input: NewLink, now: Date): Promise<WhatsAppLink | null> {
        return this.links.insertActive({
            id: IdUtil.newId(),
            userId: input.userId,
            phoneSealed: JSON.stringify(input.phoneSealed),
            phoneHash: input.phoneHash,
            phoneLast4: input.phoneLast4,
            status: LINK_STATUSES.active,
            optInAt: now,
            optInSource: OPT_IN_SOURCES.userMessage,
            linkedAt: now,
            lastInboundAt: now
        });
    }

    public async byId(id: string): Promise<WhatsAppLink | null> {
        return this.links.findById(id);
    }

    public async liveOfUser(userId: string): Promise<WhatsAppLink | null> {
        return this.links.findLiveOfUser(userId);
    }

    public async latestOfUser(userId: string): Promise<WhatsAppLink | null> {
        return this.links.findLatestOfUser(userId);
    }

    public async listLive(): Promise<WhatsAppLink[]> {
        return this.links.listLive();
    }

    public async listAll(offset: number, limit: number): Promise<WhatsAppLink[]> {
        return this.links.listAll(offset, limit);
    }

    public async markUnlinked(id: string, reason: UnlinkReason): Promise<boolean> {
        return this.links.markUnlinked(id, reason);
    }

    public async reactivate(id: string): Promise<boolean> {
        return this.links.setStatus(id, LINK_STATUSES.suspended, LINK_STATUSES.active);
    }

    public async suspendActive(): Promise<number> {
        return this.links.suspendActive();
    }

    public async touchInbound(id: string, at: Date): Promise<void> {
        await this.links.touchInbound(id, at);
    }

    public async eraseAll(batch: number): Promise<number> {
        return this.links.eraseAll(batch);
    }

    public async liveByPhoneHashAcrossTenants(phoneHash: string): Promise<WhatsAppLink | null> {
        return this.links.findLiveByPhoneHashAcrossTenants(phoneHash);
    }

    public async staleAcrossTenants(cutoff: Date, batch: number): Promise<StaleLinkRef[]> {
        return this.links.findStaleAcrossTenants(cutoff, batch);
    }

    public async countByStatusAcrossTenants(): Promise<StatusCount[]> {
        return this.links.countByStatusAcrossTenants();
    }

    public statusOf(link: WhatsAppLink): LinkStatus {
        return link.status as LinkStatus;
    }
}
