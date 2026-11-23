import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import type { ResolvedSender } from '../../whatsapp-link/services/link-resolver.service';
import { LinkResolverService } from '../../whatsapp-link/services/link-resolver.service';
import { TURN_ATTEMPTS, TURN_BACKOFF_MS } from '../domain/whatsapp-chat.types';
import { TurnAnsweredPayload, TurnRequestedPayload } from '../validation/whatsapp-chat-jobs.schemas';
import { ChatAnswerComposer, ComposedAnswer } from '../services/chat-answer.composer';
import { ChatContextRunner } from '../services/chat-context.runner';
import { ChatTurnCollector, CollectedTurn } from '../services/chat-turn.collector';

@Injectable()
export class TurnApplication {
    public constructor(
        private readonly collector: ChatTurnCollector,
        private readonly resolver: LinkResolverService,
        private readonly runner: ChatContextRunner,
        private readonly composer: ChatAnswerComposer,
        private readonly publisher: QueuePublisherPort
    ) {}

    public async run(request: TurnRequestedPayload): Promise<void> {
        const sender: ResolvedSender | null = await this.resolver.liveById(request.linkId);
        if (sender === null) {
            return;
        }
        await this.runner.as(sender, async () => this.answer(sender, request));
    }

    private async answer(sender: ResolvedSender, request: TurnRequestedPayload): Promise<void> {
        const turn: CollectedTurn | null = await this.collector.collect(request);
        if (turn === null) {
            return;
        }
        const composed: ComposedAnswer = await this.composer.compose(sender, turn);
        await this.publisher.publish(QUEUES.whatsapp, MESSAGE_TYPES.whatsappTurnAnswered, this.payloadOf(sender, turn, composed), {
            jobId: `wa-answer-${turn.wamid}`,
            attempts: TURN_ATTEMPTS,
            backoffDelayMs: TURN_BACKOFF_MS
        });
    }

    private payloadOf(sender: ResolvedSender, turn: CollectedTurn, composed: ComposedAnswer): TurnAnsweredPayload {
        return {
            wamid: turn.wamid,
            linkId: turn.linkId,
            peer: turn.peer,
            text: composed.text,
            locale: sender.locale,
            portfolio: composed.portfolio,
            receivedAt: turn.receivedAt.toISOString(),
            proposals: [...composed.proposals]
        };
    }
}
