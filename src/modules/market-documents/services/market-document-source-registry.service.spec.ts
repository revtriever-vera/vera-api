import { describe, expect, it } from 'vitest';
import { parseMarketDocumentsConfig } from '../config/market-documents.config';
import { DocumentSource } from '../domain/market-documents.types';
import { MarketDocumentSourcePort } from '../ports/market-document-source.port';
import { MarketDocumentSourceRegistryService, selectDocumentSources } from './market-document-source-registry.service';

function port(source: DocumentSource): MarketDocumentSourcePort {
    return { source, handles: (): boolean => true, fetchFor: (): Promise<[]> => Promise.resolve([]) };
}

const IPE: MarketDocumentSourcePort = port('cvm_ipe');
const ITR: MarketDocumentSourcePort = port('cvm_itr');
const FNET: MarketDocumentSourcePort = port('b3_fnet');
const LIVE: Record<DocumentSource, MarketDocumentSourcePort> = { cvm_ipe: IPE, cvm_itr: ITR, b3_fnet: FNET };

describe('selectDocumentSources', () => {
    it('enables nothing by default, B3 FNET included', () => {
        expect(selectDocumentSources(parseMarketDocumentsConfig({}), LIVE)).toEqual([]);
    });

    it('enables the CVM sources without the B3 one', () => {
        const config = parseMarketDocumentsConfig({ MARKET_DOC_CVM_IPE_ENABLED: 'true', MARKET_DOC_CVM_ITR_ENABLED: 'true' });

        expect(selectDocumentSources(config, LIVE)).toEqual([IPE, ITR]);
    });

    it('enables the B3 FNET only behind its own flag', () => {
        expect(selectDocumentSources(parseMarketDocumentsConfig({ MARKET_DOC_FNET_ENABLED: 'true' }), LIVE)).toEqual([FNET]);
    });
});

describe('MarketDocumentSourceRegistryService', () => {
    it('lists the sources it was given', () => {
        expect(new MarketDocumentSourceRegistryService([IPE]).enabled()).toEqual([IPE]);
    });
});
