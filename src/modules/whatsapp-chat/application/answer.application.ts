import { Injectable } from '@nestjs/common';
import { replyTextOf } from '../domain/reply-format';
import { ChatReplier } from '../services/chat-replier.service';
import { ChatTelemetry } from '../services/chat-telemetry.service';
import { TurnAnsweredPayload } from '../validation/whatsapp-chat-jobs.schemas';

@Injectable()
export class AnswerApplication {
    public constructor(
        private readonly replier: ChatReplier,
        private readonly telemetry: ChatTelemetry
    ) {}

    public async deliver(answer: TurnAnsweredPayload): Promise<void> {
        const text: string = replyTextOf(answer.text, { locale: answer.locale, portfolio: answer.portfolio });
        await this.replier.text(answer.peer, text);
        for (const proposal of answer.proposals) {
            await this.replier.confirmation(answer.peer, proposal.summary, proposal.id, answer.locale);
        }
        this.telemetry.delivered(Date.now() - new Date(answer.receivedAt).getTime());
    }
}
