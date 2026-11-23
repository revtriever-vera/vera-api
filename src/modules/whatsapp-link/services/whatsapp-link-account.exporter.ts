import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { LinkDomain } from '../domain/link.domain';
import { WhatsAppLink } from '../domain/whatsapp-link.types';

export const WHATSAPP_LINKS_EXPORT_AREA: string = 'whatsapp_links';

const PAGE: number = 200;

export interface WhatsAppLinksExport {
    readonly links: readonly {
        readonly userId: string;
        readonly phoneLast4: string;
        readonly status: string;
        readonly optInAt: string;
        readonly linkedAt: string;
        readonly unlinkedAt: string | null;
        readonly unlinkReason: string | null;
    }[];
}

@Injectable()
export class WhatsAppLinkAccountExporter extends AccountDataExporterPort {
    public readonly area: string = WHATSAPP_LINKS_EXPORT_AREA;

    public constructor(private readonly links: LinkDomain) {
        super();
    }

    @AsCompany()
    public async exportAll(_companyId: string): Promise<WhatsAppLinksExport> {
        const exported: WhatsAppLinksExport['links'][number][] = [];
        let page: WhatsAppLink[] = await this.links.listAll(0, PAGE);
        while (page.length > 0) {
            exported.push(...page.map((link: WhatsAppLink) => this.toExport(link)));
            page = await this.links.listAll(exported.length, PAGE);
        }
        return { links: exported };
    }

    private toExport(link: WhatsAppLink): WhatsAppLinksExport['links'][number] {
        return {
            userId: link.userId,
            phoneLast4: link.phoneLast4,
            status: link.status,
            optInAt: link.optInAt.toISOString(),
            linkedAt: link.linkedAt.toISOString(),
            unlinkedAt: link.unlinkedAt?.toISOString() ?? null,
            unlinkReason: link.unlinkReason
        };
    }
}
