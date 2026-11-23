import { Module } from '@nestjs/common';
import { AiAssistantApplicationModule } from '../../application/ai-assistant-application.module';
import { AiSummariesRetentionCommand, AiSummariesRetentionTickHandler } from './ai-summaries-retention.command';

@Module({
    imports: [AiAssistantApplicationModule],
    providers: [AiSummariesRetentionCommand, AiSummariesRetentionTickHandler]
})
export class AiAssistantCommandModule {}
