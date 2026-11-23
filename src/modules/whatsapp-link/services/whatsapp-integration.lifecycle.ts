import { Injectable } from '@nestjs/common';
import type { IntegrationKind } from '../../integration-credentials/services/integration-removed.port';
import { IntegrationRemovedPort } from '../../integration-credentials/services/integration-removed.port';
import { LinkDomain } from '../domain/link.domain';

@Injectable()
export class WhatsAppIntegrationLifecycle extends IntegrationRemovedPort {
    public readonly kind: IntegrationKind = 'whatsapp';

    public constructor(private readonly links: LinkDomain) {
        super();
    }

    public async onRemoved(): Promise<void> {
        await this.links.suspendActive();
    }
}
