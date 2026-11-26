import { DocumentDraft, DocumentIssuer, DocumentSource } from '../domain/market-documents.types';

export abstract class MarketDocumentSourcePort {
    public abstract readonly source: DocumentSource;

    public abstract handles(issuer: DocumentIssuer): boolean;

    public abstract fetchFor(issuer: DocumentIssuer): Promise<readonly DocumentDraft[]>;
}

export const MARKET_DOCUMENT_SOURCES: unique symbol = Symbol('MARKET_DOCUMENT_SOURCES');
