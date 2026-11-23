import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AiConsentsRepository } from './ai-consents.repository';
import { AiSummariesRepository } from './ai-summaries.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [AiConsentsRepository, AiSummariesRepository],
    exports: [AiConsentsRepository, AiSummariesRepository]
})
export class AiAssistantRepositoryModule {}
