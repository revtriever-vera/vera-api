import { Module } from '@nestjs/common';
import { ContextModule } from '../../context/context.module';
import { DatabaseModule } from '../../database/database.module';
import { LlmCallsRepository } from './llm-calls.repository';
import { PlatformLlmCallsRepository } from './platform-llm-calls.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [LlmCallsRepository, PlatformLlmCallsRepository],
    exports: [LlmCallsRepository, PlatformLlmCallsRepository]
})
export class LlmRepositoryModule {}
