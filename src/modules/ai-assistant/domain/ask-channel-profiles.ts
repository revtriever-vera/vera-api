import { LLM_TASKS, LlmFeature, LlmTask } from '../../../core/llm/llm.types';

export const ASK_CHANNELS: { readonly whatsapp: 'whatsapp'; readonly app: 'app' } = { whatsapp: 'whatsapp', app: 'app' };
export type AskChannel = (typeof ASK_CHANNELS)[keyof typeof ASK_CHANNELS];

export type AskFormat = 'whatsapp' | 'markdown';

export interface ChannelProfile {
    readonly channel: AskChannel;
    readonly task: LlmTask;
    readonly maxSentences: number;
    readonly maxChars: number;
    readonly format: AskFormat;
    readonly acceptsLink: boolean;
}

export const CHANNEL_PROFILES: Readonly<Record<AskChannel, ChannelProfile>> = {
    whatsapp: {
        channel: ASK_CHANNELS.whatsapp,
        task: LLM_TASKS.askVeraStep,
        maxSentences: 3,
        maxChars: 600,
        format: 'whatsapp',
        acceptsLink: false
    },
    app: {
        channel: ASK_CHANNELS.app,
        task: LLM_TASKS.askVeraAppStep,
        maxSentences: 5,
        maxChars: 900,
        format: 'markdown',
        acceptsLink: true
    }
};

export type AskRoute =
    | { readonly channel: 'whatsapp'; readonly feature: 'whatsapp' }
    | { readonly channel: 'app'; readonly feature: Extract<LlmFeature, 'ai' | 'help'> };

export function channelProfileOf(channel: AskChannel): ChannelProfile {
    return CHANNEL_PROFILES[channel];
}
