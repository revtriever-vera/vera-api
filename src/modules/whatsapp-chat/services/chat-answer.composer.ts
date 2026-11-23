import { Injectable } from '@nestjs/common';
import { AppError } from '../../../shared/errors/app.error';
import type { ResolvedSender } from '../../whatsapp-link/services/link-resolver.service';
import { AskVeraAnswer, AskVeraService, CVM_NOTICE_TOOLS } from '../../ai-assistant/services/ask-vera.service';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { WHATSAPP_CHANNEL_TOOLS } from '../domain/channel-tools';
import { chatTextsFor } from '../domain/fixed-replies';
import { ChatReplier } from './chat-replier.service';
import { CollectedTurn } from './chat-turn.collector';
import { ChatTelemetry } from './chat-telemetry.service';
import { PendingActionService, Proposed } from './pending-action.service';

export type ComposedAnswer = {
    readonly text: string;
    readonly portfolio: boolean;
    readonly proposals: readonly Proposed[];
};

@Injectable()
export class ChatAnswerComposer {
    public constructor(
        private readonly ask: AskVeraService,
        private readonly pending: PendingActionService,
        private readonly replier: ChatReplier,
        private readonly telemetry: ChatTelemetry
    ) {}

    public async compose(sender: ResolvedSender, turn: CollectedTurn): Promise<ComposedAnswer> {
        try {
            const answer: AskVeraAnswer = await this.ask.ask({
                text: turn.text,
                history: turn.history,
                locale: sender.locale,
                messageId: turn.wamid,
                allowedTools: WHATSAPP_CHANNEL_TOOLS
            });
            return await this.answered(sender, answer);
        } catch (error: unknown) {
            return this.failed(sender, error);
        }
    }

    private async answered(sender: ResolvedSender, answer: AskVeraAnswer): Promise<ComposedAnswer> {
        const proposals: Proposed[] = [];
        for (const proposal of answer.proposals) {
            const proposed: Proposed | null = await this.pending.propose(sender.linkId, proposal, sender.locale);
            if (proposed !== null) {
                proposals.push(proposed);
            }
        }
        const portfolio: boolean =
            answer.source === 'model' && answer.toolsUsed.some((tool: string): boolean => CVM_NOTICE_TOOLS.has(tool));
        return { text: answer.text, portfolio, proposals };
    }

    private async failed(sender: ResolvedSender, error: unknown): Promise<ComposedAnswer> {
        const code: string = error instanceof AppError ? error.code : 'unexpected';
        this.telemetry.turnFailed(code, sender.linkId);
        if (error instanceof CapReachedError) {
            const resetsAt: unknown = error.meta?.['resetsAt'];
            return {
                text: await this.replier.pausedBody(sender.locale, typeof resetsAt === 'string' ? resetsAt : null),
                portfolio: false,
                proposals: []
            };
        }
        return { text: chatTextsFor(sender.locale).unavailable, portfolio: false, proposals: [] };
    }
}
