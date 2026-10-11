import { Module } from '@nestjs/common';
import { PortfolioExportHttpModule } from './access/http/portfolio-export-http.module';

@Module({
    imports: [PortfolioExportHttpModule]
})
export class PortfolioExportModule {}
