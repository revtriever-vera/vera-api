import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { WhatsAppMessage } from '../domain/whatsapp.types';

export const WHATSAPP_EXPORT_AREA: string = 'whatsapp';

const LAST_DIGITS: number = 4;

export interface WhatsAppExport {
    readonly messages: readonly {
        readonly direction: string;
        readonly kind: string;
        readonly status: string;
        readonly templateName: string | null;
        readonly peerLastDigits: string;
        readonly body: string | null;
        readonly createdAt: string;
    }[];
}

@Injectable()
export class WhatsAppAccountExporter extends AccountDataExporterPort {
    public readonly area: string = WHATSAPP_EXPORT_AREA;

    public constructor(private readonly messages: WhatsAppMessageDomain) {
        super();
    }

    @AsCompany()
    public async exportAll(_companyId: string): Promise<WhatsAppExport> {
        const exported: WhatsAppExport['messages'][number][] = [];
        let page: WhatsAppMessage[] = await this.messages.listForExport(0);
        while (page.length > 0) {
            exported.push(...page.map((message: WhatsAppMessage) => this.toExport(message)));
            page = await this.messages.listForExport(exported.length);
        }
        return { messages: exported };
    }

    private toExport(message: WhatsAppMessage): WhatsAppExport['messages'][number] {
        return {
            direction: message.direction,
            kind: message.kind,
            status: message.status,
            templateName: message.templateName,
            peerLastDigits: message.peer.slice(-LAST_DIGITS),
            body: message.body,
            createdAt: message.createdAt.toISOString()
        };
    }
}
