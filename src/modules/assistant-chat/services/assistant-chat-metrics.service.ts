import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { TurnMode } from '../domain/assistant-chat.types';

export type TurnOutcome = 'answered' | 'fixed' | 'cap_reached' | 'failed';
export const TURN_OUTCOMES: Readonly<Record<'answered' | 'fixed' | 'capReached' | 'failed', TurnOutcome>> = {
    answered: 'answered',
    fixed: 'fixed',
    capReached: 'cap_reached',
    failed: 'failed'
};

const TURNS_TOTAL: string = 'vera_assistant_turns_total';
const TURN_SECONDS: string = 'vera_assistant_turn_seconds';
const UNHELPFUL_TOTAL: string = 'vera_assistant_unhelpful_total';

@Injectable()
export class AssistantChatMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public turn(mode: TurnMode, outcome: TurnOutcome): void {
        this.metrics.count(TURNS_TOTAL, { mode, outcome });
    }

    public seconds(value: number): void {
        this.metrics.observe(TURN_SECONDS, value);
    }

    public unhelpful(tool: string): void {
        this.metrics.count(UNHELPFUL_TOTAL, { tool });
    }
}
