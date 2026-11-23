import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AiConsentsRepository } from './ai-consents.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [AiConsentsRepository],
    exports: [AiConsentsRepository]
})
export class AiAssistantRepositoryModule {}
