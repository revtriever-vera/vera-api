import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HeldAssetsService } from '../../market-data/services/held-assets.service';
import { IssuerLink, IssuerLinkReaderService } from '../../portfolio-events/services/issuer-link-reader.service';
import { marketDocumentsConfig } from '../config/market-documents.config';
import { MarketDocumentDomain } from '../domain/market-document.domain';
import { CNPJ_PATTERN, DocumentIssuer } from '../domain/market-documents.types';
import { MarketDocumentsCollectorService } from '../services/market-documents-collector.service';
import { MarketDocumentsExtractorService } from '../services/market-documents-extractor.service';
import { MarketDocumentsLogService } from '../services/market-documents-log.service';
import { MarketDocumentsMetricsService } from '../services/market-documents-metrics.service';

export interface SweepOutcome {
    readonly issuers: number;
    readonly collected: number;
    readonly extracted: number;
}

interface IssuerAccumulator {
    readonly cnpj: string;
    readonly issuerKind: IssuerLink['issuerKind'];
    readonly assetIds: string[];
}

function issuersOf(links: readonly IssuerLink[]): DocumentIssuer[] {
    const valid: IssuerLink[] = links.filter((link: IssuerLink): boolean => CNPJ_PATTERN.test(link.cnpj));
    const byIssuer: Map<string, IssuerAccumulator> = new Map<string, IssuerAccumulator>();
    for (const link of valid) {
        const key: string = `${link.issuerKind}:${link.cnpj}`;
        const known: IssuerAccumulator = byIssuer.get(key) ?? { cnpj: link.cnpj, issuerKind: link.issuerKind, assetIds: [] };
        known.assetIds.push(link.assetId);
        byIssuer.set(key, known);
    }
    return [...byIssuer.values()];
}

@Injectable()
export class MarketDocumentsSweepApplication {
    public constructor(
        @Inject(marketDocumentsConfig.KEY) private readonly config: ConfigType<typeof marketDocumentsConfig>,
        private readonly held: HeldAssetsService,
        private readonly links: IssuerLinkReaderService,
        private readonly collector: MarketDocumentsCollectorService,
        private readonly extractor: MarketDocumentsExtractorService,
        private readonly documents: MarketDocumentDomain,
        private readonly metrics: MarketDocumentsMetricsService,
        private readonly logs: MarketDocumentsLogService
    ) {}

    public async handleTick(): Promise<SweepOutcome> {
        const heldIds: string[] = await this.held.listHeldAssetIds();
        const linked: IssuerLink[] = await this.links.forAssets(heldIds);
        const issuers: DocumentIssuer[] = issuersOf(linked);
        this.metrics.unlinkedAssets(heldIds.length - linked.length);
        const collected: number = await this.collector.collect(issuers);
        const extracted: number = await this.extractor.extractPending();
        const deleted: number = await this.documents.applyRetention(this.config.MARKET_DOC_RETENTION_DAYS);
        this.logs.sweepFinished(heldIds.length, issuers.length, collected, extracted);
        this.logs.retentionApplied(deleted);
        return { issuers: issuers.length, collected, extracted };
    }
}
