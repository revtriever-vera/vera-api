import type { WhatsAppChannel } from '../../whatsapp/services/whatsapp-channel.service';

export function channelServes(channel: WhatsAppChannel, companyId: string): boolean {
    return channel.companyId === null || channel.companyId === companyId;
}
