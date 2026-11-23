import { Injectable } from '@nestjs/common';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { UNLINK_REASONS } from '../domain/whatsapp-link.types';
import { LinkUnlinkService } from './link-unlink.service';

@Injectable()
export class WhatsAppMemberLifecycle extends MemberDeparturePort {
    public readonly area: string = 'whatsapp-link';

    public constructor(private readonly unlinker: LinkUnlinkService) {
        super();
    }

    public async onMemberRemoved(userId: string): Promise<void> {
        await this.unlinker.unlinkUser(userId, UNLINK_REASONS.memberRemoved);
    }
}
