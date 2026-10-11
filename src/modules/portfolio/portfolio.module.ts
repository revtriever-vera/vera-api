import { Module } from '@nestjs/common';
import { PortfolioHttpModule } from './access/http/portfolio-http.module';

@Module({
    imports: [PortfolioHttpModule]
})
export class PortfolioModule {}
