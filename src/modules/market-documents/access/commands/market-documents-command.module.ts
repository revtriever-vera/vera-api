import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { MarketDocumentsApplicationModule } from '../../application/market-documents-application.module';
import { MarketDocumentsSweepCommand, MarketDocumentsSweepTickHandler } from './market-documents-sweep.command';

@Module({
    imports: [MarketDocumentsApplicationModule, QueueModule],
    providers: [MarketDocumentsSweepCommand, MarketDocumentsSweepTickHandler]
})
export class MarketDocumentsCommandModule {}
