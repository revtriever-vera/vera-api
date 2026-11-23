import { Module } from '@nestjs/common';
import { AiAssistantRepositoryModule } from '../repositories/ai-assistant-repository.module';
import { AiConsentDomain } from './ai-consent.domain';

@Module({
    imports: [AiAssistantRepositoryModule],
    providers: [AiConsentDomain],
    exports: [AiConsentDomain]
})
export class AiAssistantDomainModule {}
