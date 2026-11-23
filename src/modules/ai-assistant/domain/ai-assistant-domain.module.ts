import { Module } from '@nestjs/common';
import { AiAssistantRepositoryModule } from '../repositories/ai-assistant-repository.module';
import { AiConsentDomain } from './ai-consent.domain';
import { AiSummaryDomain } from './ai-summary.domain';

@Module({
    imports: [AiAssistantRepositoryModule],
    providers: [AiConsentDomain, AiSummaryDomain],
    exports: [AiConsentDomain, AiSummaryDomain]
})
export class AiAssistantDomainModule {}
