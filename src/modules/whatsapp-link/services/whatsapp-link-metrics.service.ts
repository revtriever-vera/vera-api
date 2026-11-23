import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const CODES_TOTAL: string = 'vera_whatsapp_link_codes_total';
const LINKS: string = 'vera_whatsapp_links';
const UNLINKS_TOTAL: string = 'vera_whatsapp_unlinks_total';

export type CodeOutcome = 'issued' | 'linked' | 'rejected' | 'expired';

@Injectable()
export class WhatsAppLinkMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public code(outcome: CodeOutcome): void {
        this.metrics.count(CODES_TOTAL, { outcome });
    }

    public links(status: string, total: number): void {
        this.metrics.gauge(LINKS, total, { status });
    }

    public unlinked(reason: string): void {
        this.metrics.count(UNLINKS_TOTAL, { reason });
    }
}
