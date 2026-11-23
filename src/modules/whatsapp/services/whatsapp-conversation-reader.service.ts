import { Injectable } from '@nestjs/common';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { WhatsAppMessage } from '../domain/whatsapp.types';

export type ConversationTurn = {
    readonly direction: 'in' | 'out';
    readonly text: string;
    readonly at: Date;
};

export type InboundText = {
    readonly wamid: string;
    readonly peer: string;
    readonly linkId: string | null;
    readonly text: string;
    readonly at: Date;
};

function turnOf(message: WhatsAppMessage): ConversationTurn {
    return { direction: message.direction === 'in' ? 'in' : 'out', text: message.body ?? '', at: message.createdAt };
}

function inboundOf(message: WhatsAppMessage): InboundText | null {
    return message.externalId === null || message.body === null
        ? null
        : { wamid: message.externalId, peer: message.peer, linkId: message.linkId, text: message.body, at: message.createdAt };
}

@Injectable()
export class WhatsAppConversationReader {
    public constructor(private readonly messages: WhatsAppMessageDomain) {}

    public async history(
        peer: string,
        window: { readonly since: Date; readonly before: Date },
        limit: number
    ): Promise<ConversationTurn[]> {
        return (await this.messages.textsOfPeer(peer, window, limit)).map(turnOf);
    }

    public async inbound(wamid: string): Promise<InboundText | null> {
        const message: WhatsAppMessage | null = await this.messages.findInbound(wamid);
        return message === null ? null : inboundOf(message);
    }

    public async inboundSince(peer: string, since: Date): Promise<InboundText[]> {
        const found: (InboundText | null)[] = (await this.messages.inboundTextsSince(peer, since)).map(inboundOf);
        return found.filter((entry: InboundText | null): entry is InboundText => entry !== null);
    }

    public async recordedAt(wamid: string): Promise<Date | null> {
        return this.messages.createdAtOf(wamid);
    }
}
