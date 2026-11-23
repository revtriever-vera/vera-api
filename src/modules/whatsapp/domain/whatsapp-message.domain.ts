import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import { WhatsAppMessagesRepository } from '../repositories/whatsapp-messages.repository';
import {
    InboundMessage,
    MESSAGE_KINDS,
    MESSAGE_STATUSES,
    MessageKind,
    OutboundPayload,
    StatusUpdate,
    WhatsAppMessage
} from './whatsapp.types';

export type NewOutbound = {
    readonly peer: string;
    readonly kind: MessageKind;
    readonly body: string | null;
    readonly templateName: string | null;
    readonly payload: OutboundPayload | null;
};

@Injectable()
export class WhatsAppMessageDomain {
    public constructor(private readonly messages: WhatsAppMessagesRepository) {}

    public async queue(input: NewOutbound): Promise<WhatsAppMessage> {
        return this.messages.create({
            id: IdUtil.newId(),
            peer: input.peer,
            direction: 'out',
            kind: input.kind,
            body: input.body,
            templateName: input.templateName,
            payload: input.payload === null ? null : JSON.stringify(input.payload),
            status: MESSAGE_STATUSES.queued
        });
    }

    public async recordInbound(message: InboundMessage): Promise<boolean> {
        return this.messages.insertInbound({
            id: IdUtil.newId(),
            peer: message.from,
            direction: 'in',
            kind: message.kind === 'text' ? MESSAGE_KINDS.text : message.kind,
            body: message.text ?? message.buttonPayload ?? null,
            externalId: message.wamid,
            status: MESSAGE_STATUSES.received,
            sentAt: message.timestamp
        });
    }

    public async discardInbound(wamid: string): Promise<void> {
        await this.messages.discardInbound(wamid);
    }

    public async find(id: string): Promise<WhatsAppMessage | null> {
        return this.messages.findById(id);
    }

    public async claimSending(id: string): Promise<boolean> {
        return this.messages.claimSending(id);
    }

    public async releaseSending(id: string): Promise<void> {
        await this.messages.releaseSending(id);
    }

    public async markSent(id: string, wamid: string): Promise<void> {
        await this.messages.markSent(id, wamid);
    }

    public async markEnded(id: string, status: 'failed' | 'blocked', errorCode: string): Promise<void> {
        await this.messages.markEnded(id, status, errorCode);
    }

    public async lastInboundAt(peer: string): Promise<Date | null> {
        return this.messages.lastInboundAt(peer);
    }

    public async advanceStatus(update: StatusUpdate): Promise<boolean> {
        return this.messages.advanceStatusAcrossTenants(update.status, update);
    }

    public async listForExport(offset: number): Promise<WhatsAppMessage[]> {
        return this.messages.listForExport(offset);
    }

    public async eraseAll(batch: number): Promise<number> {
        return this.messages.eraseAll(batch);
    }

    public async purgeTextBefore(cutoff: Date, batch: number): Promise<number> {
        return this.messages.purgeTextBeforeAcrossTenants(cutoff, batch);
    }
}
