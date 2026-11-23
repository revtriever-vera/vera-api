import { Injectable } from '@nestjs/common';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { isWindowOpen } from '../domain/window';

@Injectable()
export class WhatsAppWindowService {
    public constructor(private readonly messages: WhatsAppMessageDomain) {}

    public async isOpen(peer: string, now: Date = new Date()): Promise<boolean> {
        return isWindowOpen(await this.messages.lastInboundAt(peer), now);
    }
}
