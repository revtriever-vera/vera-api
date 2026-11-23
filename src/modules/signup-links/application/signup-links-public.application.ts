import { Injectable } from '@nestjs/common';
import { PlatformAvailabilityService } from '../../identity/services/platform-availability.service';
import { SignupLinkDomain } from '../domain/signup-link.domain';
import { statusOf } from '../domain/signup-link-status';
import { SignupLinkNotFoundError } from '../domain/signup-links.errors';
import { LINK_STATUSES, SignupLink } from '../domain/signup-links.types';
import { SignupLinkViewMapper } from '../services/signup-link-view.mapper';
import { PublicOfferView } from '../validation/signup-links.schemas';

@Injectable()
export class SignupLinksPublicApplication {
    public constructor(
        private readonly links: SignupLinkDomain,
        private readonly availability: PlatformAvailabilityService,
        private readonly mapper: SignupLinkViewMapper
    ) {}

    public async offerOf(token: string): Promise<PublicOfferView> {
        if (!this.availability.enabled()) {
            throw new SignupLinkNotFoundError();
        }
        const link: SignupLink | null = await this.links.findByToken(token);
        if (!link || statusOf(link, new Date()) !== LINK_STATUSES.active) {
            throw new SignupLinkNotFoundError();
        }
        return this.mapper.toPublicView(link);
    }
}
