import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { marketDocumentsConfig } from '../config/market-documents.config';
import { DOCUMENT_SOURCES, DocumentSource } from '../domain/market-documents.types';
import { MARKET_DOCUMENT_SOURCES, MarketDocumentSourcePort } from '../ports/market-document-source.port';

type MarketDocumentsSettings = ConfigType<typeof marketDocumentsConfig>;

export function selectDocumentSources(
    config: MarketDocumentsSettings,
    live: Readonly<Record<DocumentSource, MarketDocumentSourcePort>>
): MarketDocumentSourcePort[] {
    const enabled: MarketDocumentSourcePort[] = [];
    if (config.MARKET_DOC_CVM_IPE_ENABLED) {
        enabled.push(live[DOCUMENT_SOURCES.cvmIpe]);
    }
    if (config.MARKET_DOC_CVM_ITR_ENABLED) {
        enabled.push(live[DOCUMENT_SOURCES.cvmItr]);
    }
    if (config.MARKET_DOC_FNET_ENABLED) {
        enabled.push(live[DOCUMENT_SOURCES.b3Fnet]);
    }
    return enabled;
}

@Injectable()
export class MarketDocumentSourceRegistryService {
    public constructor(@Inject(MARKET_DOCUMENT_SOURCES) private readonly sources: readonly MarketDocumentSourcePort[]) {}

    public enabled(): readonly MarketDocumentSourcePort[] {
        return this.sources;
    }
}
