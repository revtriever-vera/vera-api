import { Module } from '@nestjs/common';
import { MarketDocumentsCommandModule } from './access/commands/market-documents-command.module';

@Module({
    imports: [MarketDocumentsCommandModule]
})
export class MarketDocumentsModule {}
