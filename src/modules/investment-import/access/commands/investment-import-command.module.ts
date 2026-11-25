import { Module } from '@nestjs/common';
import { InvestmentImportApplicationModule } from '../../application/investment-import-application.module';
import { PreviewsPurgeCommand, PreviewsPurgeTickHandler } from './previews-purge.command';

@Module({
    imports: [InvestmentImportApplicationModule],
    providers: [PreviewsPurgeCommand, PreviewsPurgeTickHandler]
})
export class InvestmentImportCommandModule {}
