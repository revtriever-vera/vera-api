import { Module } from '@nestjs/common';
import { SpendingSummaryHttpModule } from './access/http/spending-summary-http.module';

@Module({
    imports: [SpendingSummaryHttpModule]
})
export class SpendingSummaryModule {}
