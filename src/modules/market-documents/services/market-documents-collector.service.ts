import { Injectable } from '@nestjs/common';
import { MarketDocumentDomain } from '../domain/market-document.domain';
import { DocumentDraft, DocumentIssuer, MarketDocumentWrite } from '../domain/market-documents.types';
import { MarketDocumentSourcePort } from '../ports/market-document-source.port';
import { MarketDocumentSourceRegistryService } from './market-document-source-registry.service';
import { MarketDocumentsLogService } from './market-documents-log.service';
import { MarketDocumentsMetricsService } from './market-documents-metrics.service';

const MAX_CONSECUTIVE_FAILURES: number = 3;
const UNEXPECTED: string = 'unexpected';
const KNOWN_ERRORS: ReadonlySet<string> = new Set<string>(['ProviderError', 'CatalogSourceError']);

function reasonOf(error: unknown): string {
    return error instanceof Error && KNOWN_ERRORS.has(error.name) ? error.message : UNEXPECTED;
}

@Injectable()
export class MarketDocumentsCollectorService {
    public constructor(
        private readonly registry: MarketDocumentSourceRegistryService,
        private readonly documents: MarketDocumentDomain,
        private readonly metrics: MarketDocumentsMetricsService,
        private readonly logs: MarketDocumentsLogService
    ) {}

    public async collect(issuers: readonly DocumentIssuer[]): Promise<number> {
        let collected: number = 0;
        for (const source of this.registry.enabled()) {
            collected += await this.collectFrom(source, this.issuersOf(source, issuers));
        }
        return collected;
    }

    private issuersOf(source: MarketDocumentSourcePort, issuers: readonly DocumentIssuer[]): DocumentIssuer[] {
        return issuers.filter((issuer: DocumentIssuer): boolean => source.handles(issuer));
    }

    private async collectFrom(source: MarketDocumentSourcePort, issuers: readonly DocumentIssuer[]): Promise<number> {
        let collected: number = 0;
        let failures: number = 0;
        for (const issuer of issuers) {
            const stored: number | null = await this.collectOne(source, issuer);
            failures = stored === null ? failures + 1 : 0;
            collected += stored ?? 0;
            if (failures >= MAX_CONSECUTIVE_FAILURES) {
                break;
            }
        }
        this.metrics.collected(source.source, collected);
        return collected;
    }

    private async collectOne(source: MarketDocumentSourcePort, issuer: DocumentIssuer): Promise<number | null> {
        try {
            const drafts: readonly DocumentDraft[] = await source.fetchFor(issuer);
            return await this.documents.saveMany(
                drafts.map((draft: DocumentDraft): MarketDocumentWrite => ({
                    ...draft,
                    source: source.source,
                    issuerCnpj: issuer.cnpj,
                    assetIds: issuer.assetIds
                }))
            );
        } catch (error: unknown) {
            this.metrics.sourceFailed(source.source, reasonOf(error));
            this.logs.sourceFailed(source.source, reasonOf(error));
            return null;
        }
    }
}
