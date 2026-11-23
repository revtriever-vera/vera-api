import { Injectable } from '@nestjs/common';
import { AnswerCheck } from '../domain/ask-answer-guard';
import { AskVeraOutcome } from '../domain/ask-vera.types';
import { AiAssistantLogService, AskAnsweredMeta } from './ai-assistant-log.service';
import { AiAssistantMetricsService } from './ai-assistant-metrics.service';

export interface AskFinished {
    readonly outcome: AskVeraOutcome;
    readonly meta: AskAnsweredMeta;
}

@Injectable()
export class AskVeraTelemetryService {
    public constructor(
        private readonly logs: AiAssistantLogService,
        private readonly metrics: AiAssistantMetricsService
    ) {}

    public finished(finished: AskFinished): void {
        this.metrics.ask(finished.outcome);
        if (finished.meta.steps > 0) {
            this.metrics.askSteps(finished.meta.steps);
        }
        for (const tool of finished.meta.toolsUsed) {
            this.metrics.askToolCall(tool);
        }
        this.logs.askAnswered(finished.meta);
    }

    public capReached(): void {
        this.metrics.ask('cap_reached');
    }

    public toolFailed(tool: string): void {
        this.logs.askToolFailed(tool);
    }

    public checkFailed(check: AnswerCheck): void {
        this.logs.askCheckFailed(check);
    }
}
