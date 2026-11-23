import { Module } from '@nestjs/common';
import { LlmRepositoryModule } from '../repositories/llm-repository.module';
import { LlmCallDomain } from './llm-call.domain';

@Module({
    imports: [LlmRepositoryModule],
    providers: [LlmCallDomain],
    exports: [LlmCallDomain]
})
export class LlmDomainModule {}
