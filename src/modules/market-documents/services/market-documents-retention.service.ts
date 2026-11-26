import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { marketDocumentsConfig } from '../config/market-documents.config';
import { MarketDocumentDomain } from '../domain/market-document.domain';

@Injectable()
export class MarketDocumentsRetentionService {
    public constructor(
        @Inject(marketDocumentsConfig.KEY) private readonly config: ConfigType<typeof marketDocumentsConfig>,
        private readonly documents: MarketDocumentDomain
    ) {}

    public async apply(): Promise<number> {
        return this.documents.applyRetention(this.config.MARKET_DOC_RETENTION_DAYS);
    }
}
