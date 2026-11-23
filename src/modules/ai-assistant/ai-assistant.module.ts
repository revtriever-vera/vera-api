import { Module } from '@nestjs/common';
import { AiAssistantHttpModule } from './access/http/ai-assistant-http.module';

@Module({
    imports: [AiAssistantHttpModule]
})
export class AiAssistantModule {}
