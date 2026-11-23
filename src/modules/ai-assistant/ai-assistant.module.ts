import { Module } from '@nestjs/common';
import { AiAssistantCommandModule } from './access/commands/ai-assistant-command.module';
import { AiAssistantHttpModule } from './access/http/ai-assistant-http.module';

@Module({
    imports: [AiAssistantHttpModule, AiAssistantCommandModule]
})
export class AiAssistantModule {}
