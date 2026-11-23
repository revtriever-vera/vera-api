import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import type { InboundMessage } from '../../whatsapp/services/inbound-dispatch.port';
import { whatsappChatConfig } from '../config/whatsapp-chat.config';
import { ROOM_ESTIMATE_MICROS, TURN_ATTEMPTS, TURN_BACKOFF_MS } from '../domain/whatsapp-chat.types';
import { ChatLimitsService, QuestionAllowance } from './chat-limits.service';

export type ScheduleOutcome =
    | { readonly state: 'queued' }
    | { readonly state: 'limited'; readonly notice: boolean }
    | { readonly state: 'cap_reached'; readonly resetsAt: string | null };

@Injectable()
export class ChatTurnScheduler {
    public constructor(
        private readonly limits: ChatLimitsService,
        private readonly meter: PaidUsageMeter,
        private readonly publisher: QueuePublisherPort,
        @Inject(whatsappChatConfig.KEY) private readonly config: ConfigType<typeof whatsappChatConfig>
    ) {}

    public async schedule(linkId: string, message: InboundMessage): Promise<ScheduleOutcome> {
        const allowance: QuestionAllowance = await this.limits.allowQuestion(linkId);
        if (allowance !== 'allowed') {
            return { state: 'limited', notice: allowance === 'limited_notice' };
        }
        try {
            await this.meter.assertRoom({ feature: 'whatsapp', task: 'ask_vera', estimateMicros: ROOM_ESTIMATE_MICROS });
        } catch (error: unknown) {
            if (error instanceof CapReachedError) {
                return { state: 'cap_reached', resetsAt: typeof error.meta?.['resetsAt'] === 'string' ? error.meta['resetsAt'] : null };
            }
            throw error;
        }
        await this.publish(linkId, message);
        return { state: 'queued' };
    }

    private async publish(linkId: string, message: InboundMessage): Promise<void> {
        await this.publisher.publish(
            QUEUES.whatsapp,
            MESSAGE_TYPES.whatsappTurnRequested,
            { wamid: message.wamid, linkId, ...(message.contextWamid === undefined ? {} : { contextWamid: message.contextWamid }) },
            {
                jobId: `wa-turn-${message.wamid}`,
                delayMs: this.config.WHATSAPP_CHAT_COALESCE_MS,
                attempts: TURN_ATTEMPTS,
                backoffDelayMs: TURN_BACKOFF_MS
            }
        );
    }
}
