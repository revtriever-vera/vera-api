import { Module } from '@nestjs/common';
import { ContributionHttpModule } from './access/http/contribution-http.module';

@Module({
    imports: [ContributionHttpModule]
})
export class ContributionModule {}
