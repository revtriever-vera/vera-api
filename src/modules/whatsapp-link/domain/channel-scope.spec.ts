import { describe, expect, it } from 'vitest';
import type { WhatsAppChannel } from '../../whatsapp/services/whatsapp-channel.service';
import { channelServes } from './channel-scope';

function channelOf(companyId: string | null): WhatsAppChannel {
    return { phoneNumberId: 'p', wabaId: null, accessToken: 't', appSecret: 's', verifyToken: 'v', displayNumber: null, companyId };
}

describe('channelServes', () => {
    it('the hosted channel serves every company', () => {
        expect(channelServes(channelOf(null), 'company-a')).toBe(true);
    });

    it('a self-hosted channel serves only its own company', () => {
        expect(channelServes(channelOf('company-a'), 'company-a')).toBe(true);
        expect(channelServes(channelOf('company-a'), 'company-b')).toBe(false);
    });
});
