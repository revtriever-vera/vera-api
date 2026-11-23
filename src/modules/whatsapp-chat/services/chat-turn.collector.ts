import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import type { AskVeraTurn } from '../../ai-assistant/services/ask-vera.service';
import { ConversationTurn, InboundText, WhatsAppConversationReader } from '../../whatsapp/services/whatsapp-conversation-reader.service';
import { isFreeQuestion } from '../domain/conversation-router';
import { COALESCE_WINDOW_MS, HISTORY_LIMIT } from '../domain/whatsapp-chat.types';
import { ChatLimitsService } from './chat-limits.service';

export type TurnRequest = { readonly wamid: string; readonly linkId: string; readonly contextWamid?: string };

export type CollectedTurn = {
    readonly wamid: string;
    readonly peer: string;
    readonly linkId: string;
    readonly text: string;
    readonly receivedAt: Date;
    readonly history: readonly AskVeraTurn[];
};

function turnOf(entry: ConversationTurn): AskVeraTurn {
    return { role: entry.direction === 'in' ? 'person' : 'vera', text: entry.text };
}

@Injectable()
export class ChatTurnCollector {
    public constructor(
        private readonly reader: WhatsAppConversationReader,
        private readonly limits: ChatLimitsService,
        private readonly timezones: CompanyTimezoneService
    ) {}

    public async collect(request: TurnRequest): Promise<CollectedTurn | null> {
        const { wamid, linkId, contextWamid } = request;
        const first: InboundText | null = await this.reader.inbound(wamid);
        if (first === null) {
            return null;
        }
        const batch: InboundText[] = await this.claimed(first);
        const earliest: InboundText | undefined = batch[0];
        if (earliest === undefined || !batch.some((entry: InboundText): boolean => entry.wamid === wamid)) {
            return null;
        }
        const history: AskVeraTurn[] = await this.historyBefore(earliest, contextWamid ?? null);
        return {
            wamid,
            peer: first.peer,
            linkId,
            text: batch.map((entry: InboundText): string => entry.text).join('\n'),
            receivedAt: first.at,
            history
        };
    }

    private async claimed(first: InboundText): Promise<InboundText[]> {
        const until: number = first.at.getTime() + COALESCE_WINDOW_MS;
        const candidates: InboundText[] = (await this.reader.inboundSince(first.peer, first.at)).filter(
            (entry: InboundText): boolean => entry.at.getTime() <= until && isFreeQuestion(entry.text)
        );
        const claimed: InboundText[] = [];
        for (const candidate of candidates) {
            if (await this.limits.claimTurn(candidate.wamid)) {
                claimed.push(candidate);
            }
        }
        return claimed;
    }

    private async historyBefore(earliest: InboundText, contextWamid: string | null): Promise<AskVeraTurn[]> {
        const timeZone: string = await this.timezones.timezoneOfCompany();
        const anchor: Date = (contextWamid === null ? null : await this.reader.recordedAt(contextWamid)) ?? earliest.at;
        const since: Date = DateUtil.startOfDayIn(timeZone, anchor);
        return (await this.reader.history(earliest.peer, { since, before: earliest.at }, HISTORY_LIMIT)).map(turnOf);
    }
}
