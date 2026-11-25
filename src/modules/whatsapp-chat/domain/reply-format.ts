import { AppLocale } from '../../../shared/i18n/locale';
import { investmentNoticeText } from '../../ai-assistant/services/ask-vera.service';
import { limitSentences } from './reply-sentences';
import { MAX_REPLY_SENTENCES } from './whatsapp-chat.types';

export type ReplyShape = { readonly locale: AppLocale; readonly portfolio: boolean };

export function replyTextOf(raw: string, shape: ReplyShape): string {
    const notice: string = investmentNoticeText(shape.locale);
    const limited: string = limitSentences(raw.replace(notice, '').trim(), MAX_REPLY_SENTENCES);
    return shape.portfolio ? `${limited}\n${notice}` : limited;
}
