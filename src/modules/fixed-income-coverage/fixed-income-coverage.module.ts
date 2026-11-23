import { Module } from '@nestjs/common';
import { FixedIncomeCoverageHttpModule } from './access/http/fixed-income-coverage-http.module';

@Module({
    imports: [FixedIncomeCoverageHttpModule]
})
export class FixedIncomeCoverageModule {}
