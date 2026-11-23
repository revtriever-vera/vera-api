import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { whatsappChatConfig } from '../config/whatsapp-chat.config';
import { LIMITED_NOTICE_SECONDS, ONE_DAY_SECONDS, ONE_MINUTE_SECONDS } from '../domain/whatsapp-chat.types';

export type QuestionAllowance = 'allowed' | 'limited_notice' | 'limited_silent';

const CLAIM_KEEP_SECONDS: number = 7 * ONE_DAY_SECONDS;

@Injectable()
export class ChatLimitsService {
    public constructor(
        private readonly throttle: ThrottleService,
        @Inject(whatsappChatConfig.KEY) private readonly config: ConfigType<typeof whatsappChatConfig>
    ) {}

    public async allowQuestion(linkId: string): Promise<QuestionAllowance> {
        const withinMinute: boolean = await this.throttle.isAllowed(
            `wa-chat-minute:${linkId}`,
            this.config.WHATSAPP_CHAT_LIMIT_MINUTE,
            ONE_MINUTE_SECONDS
        );
        const withinDay: boolean =
            withinMinute && (await this.throttle.isAllowed(`wa-chat-day:${linkId}`, this.config.WHATSAPP_CHAT_LIMIT_DAY, ONE_DAY_SECONDS));
        if (withinMinute && withinDay) {
            return 'allowed';
        }
        return (await this.throttle.isAllowed(`wa-chat-limited:${linkId}`, 1, LIMITED_NOTICE_SECONDS))
            ? 'limited_notice'
            : 'limited_silent';
    }

    public async firstToday(key: string): Promise<boolean> {
        return this.throttle.isAllowed(key, 1, ONE_DAY_SECONDS);
    }

    public async claimTurn(wamid: string): Promise<boolean> {
        return this.throttle.isAllowed(`wa-turn-claim:${wamid}`, 1, CLAIM_KEEP_SECONDS);
    }
}
