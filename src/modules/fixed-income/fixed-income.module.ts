import { Module } from '@nestjs/common';
import { FixedIncomeHttpModule } from './access/http/fixed-income-http.module';
import { FixedIncomeQueueModule } from './access/queue/fixed-income-queue.module';

@Module({
    imports: [FixedIncomeHttpModule, FixedIncomeQueueModule]
})
export class FixedIncomeModule {}
