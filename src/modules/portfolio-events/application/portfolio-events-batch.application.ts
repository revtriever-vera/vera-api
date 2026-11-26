import { Injectable } from '@nestjs/common';
import { AssetIssuerLinkDomain } from '../domain/asset-issuer-link.domain';
import { PortfolioEventDomain } from '../domain/portfolio-event.domain';
import { IssuerLink, PortfolioEventDraft, PortfolioEventWrite } from '../domain/portfolio-events.types';
import { PortfolioEventSourcePort } from '../ports/portfolio-event-source.port';
import { PortfolioEventSourceRegistryService } from '../services/portfolio-event-source-registry.service';
import { PortfolioEventsLogService } from '../services/portfolio-events-log.service';
import { PortfolioEventsMetricsService } from '../services/portfolio-events-metrics.service';
import { BatchPayload, batchPayloadSchema } from '../validation/portfolio-events.schemas';

interface BatchOutcome {
    events: number;
    failed: number;
}

const KNOWN_SOURCE_ERRORS: ReadonlySet<string> = new Set<string>(['ProviderError', 'CatalogSourceError']);

function reasonOf(error: unknown): string {
    return error instanceof Error && KNOWN_SOURCE_ERRORS.has(error.name) ? error.message : 'unexpected';
}

@Injectable()
export class PortfolioEventsBatchApplication {
    public constructor(
        private readonly links: AssetIssuerLinkDomain,
        private readonly events: PortfolioEventDomain,
        private readonly registry: PortfolioEventSourceRegistryService,
        private readonly metrics: PortfolioEventsMetricsService,
        private readonly logs: PortfolioEventsLogService
    ) {}

    public async handleBatch(payload: unknown): Promise<BatchOutcome | null> {
        const parsed: ReturnType<typeof batchPayloadSchema.safeParse> = batchPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            this.logs.invalidPayload();
            return null;
        }
        const port: PortfolioEventSourcePort | null = this.registry.find(parsed.data.source);
        if (port === null) {
            this.logs.sourceUnavailable(parsed.data.source);
            return null;
        }
        return this.run(port, parsed.data);
    }

    private async run(port: PortfolioEventSourcePort, payload: BatchPayload): Promise<BatchOutcome> {
        const links: IssuerLink[] = (await this.links.findByAssetIds(payload.assetIds)).filter((link: IssuerLink): boolean =>
            port.handles(link)
        );
        const outcome: BatchOutcome = { events: 0, failed: 0 };
        for (const link of links) {
            const stored: number | null = await this.collect(port, link);
            outcome.events += stored ?? 0;
            outcome.failed += stored === null ? 1 : 0;
        }
        this.logs.batchFinished(port.source, links.length, outcome.events, outcome.failed);
        return outcome;
    }

    private async collect(port: PortfolioEventSourcePort, link: IssuerLink): Promise<number | null> {
        try {
            const drafts: readonly PortfolioEventDraft[] = await port.fetchFor(link);
            const writes: PortfolioEventWrite[] = drafts.map((draft: PortfolioEventDraft): PortfolioEventWrite => ({
                ...draft,
                assetId: link.assetId,
                source: port.source
            }));
            const stored: number = await this.events.saveMany(writes);
            this.countFetched(port, drafts);
            return stored;
        } catch (error: unknown) {
            this.metrics.sourceFailed(port.source, reasonOf(error));
            this.logs.sourceFailed(port.source, reasonOf(error));
            return null;
        }
    }

    private countFetched(port: PortfolioEventSourcePort, drafts: readonly PortfolioEventDraft[]): void {
        const byKind: Map<string, number> = new Map<string, number>();
        for (const draft of drafts) {
            byKind.set(draft.kind, (byKind.get(draft.kind) ?? 0) + 1);
        }
        for (const [kind, amount] of byKind) {
            this.metrics.fetched(port.source, kind, amount);
        }
    }
}
