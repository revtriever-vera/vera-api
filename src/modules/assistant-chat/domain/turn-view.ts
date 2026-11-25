import { UsageState } from '../../../core/usage/usage.types';
import { APP_LOCALES, AppLocale } from '../../../shared/i18n/locale';
import { AskVeraSent, investmentNoticeText } from '../../ai-assistant/services/ask-vera.service';
import type { UsageView } from '../validation/assistant-chat.schemas';
import { DATA_LOCKED_TOOL } from '../../ai-assistant/services/tools/data-locked.tool';
import { ACCESS_STATES, AccessState, AssistantMessage, TURN_MODES, TurnMode } from './assistant-chat.types';

export interface SplitText {
    readonly text: string;
    readonly notice: string | null;
}

export function splitNotice(text: string): SplitText {
    const line: string | undefined = APP_LOCALES.map((locale: AppLocale): string => investmentNoticeText(locale)).find(
        (candidate: string): boolean => text.includes(candidate)
    );
    return line === undefined ? { text, notice: null } : { text: text.replace(line, '').trim(), notice: line };
}

export function toolsOf(message: Pick<AssistantMessage, 'toolsUsed'>): string[] {
    const value: unknown = message.toolsUsed;
    return Array.isArray(value) ? value.filter((item: unknown): item is string => typeof item === 'string') : [];
}

export function modeOf(message: Pick<AssistantMessage, 'mode'>): TurnMode {
    return message.mode === TURN_MODES.ai ? TURN_MODES.ai : TURN_MODES.help;
}

export function retentionCutoffOf(now: Date, days: number): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function usageViewOf(state: UsageState, mode: TurnMode): UsageView {
    const band: Pick<UsageState, 'state' | 'usedBps'> = mode === TURN_MODES.help ? state.help : state;
    return { state: band.state, usedBps: band.usedBps, resetsAt: state.resetsAt };
}

export function sentAvailableOf(message: Pick<AssistantMessage, 'sent'>): boolean {
    return Array.isArray(message.sent) && message.sent.length > 0;
}

export function sentOf(message: Pick<AssistantMessage, 'sent'>): AskVeraSent[] {
    return Array.isArray(message.sent) ? (message.sent as unknown as AskVeraSent[]) : [];
}

export function accessOf(message: Pick<AssistantMessage, 'toolsUsed'>, lock: AccessState): AccessState {
    return toolsOf(message).includes(DATA_LOCKED_TOOL) ? lock : ACCESS_STATES.ok;
}
