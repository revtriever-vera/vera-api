export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export const LLM_TASKS = {
    summaryMonth: 'summary_month',
    summaryCuts: 'summary_cuts',
    summaryPortfolio: 'summary_portfolio',
    askVeraStep: 'ask_vera_step',
    askVeraAppStep: 'ask_vera_app_step',
    investmentExtract: 'investment_extract'
} as const;

export const LLM_REASONING_LEVELS = ['provider-default', 'minimal'] as const;
export type LlmReasoning = (typeof LLM_REASONING_LEVELS)[number];

export const LLM_MODEL_ROLES = ['primary', 'vision'] as const;
export type LlmModelRole = (typeof LLM_MODEL_ROLES)[number];

export type LlmTask = (typeof LLM_TASKS)[keyof typeof LLM_TASKS];

export const LLM_FEATURES = ['ai', 'whatsapp', 'help'] as const;
export type LlmFeature = (typeof LLM_FEATURES)[number];

export const LLM_DRIVERS = { gateway: 'gateway', openaiCompatible: 'openai_compatible', mock: 'mock' } as const;
export type LlmDriverName = (typeof LLM_DRIVERS)[keyof typeof LLM_DRIVERS];

export const LLM_OUTCOMES = {
    answered: 'answered',
    failed: 'failed',
    invalid: 'invalid',
    capReached: 'cap_reached',
    disabled: 'disabled'
} as const;
export type LlmOutcome = (typeof LLM_OUTCOMES)[keyof typeof LLM_OUTCOMES];

export type LlmStopReason = 'end' | 'max_tokens' | 'tool_use';

export interface LlmTextBlock {
    readonly kind: 'text';
    readonly text: string;
}

export interface LlmToolUse {
    readonly toolUseId: string;
    readonly name: string;
    readonly input: JsonValue;
}

export interface LlmToolUseBlock extends LlmToolUse {
    readonly kind: 'tool_use';
}

export interface LlmToolResultBlock {
    readonly kind: 'tool_result';
    readonly toolUseId: string;
    readonly content: string;
    readonly isError: boolean;
}

export const LLM_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type LlmImageMediaType = (typeof LLM_IMAGE_MEDIA_TYPES)[number];

export const LLM_FILE_MEDIA_TYPE = 'application/pdf' as const;

export interface LlmImageBlock {
    readonly kind: 'image';
    readonly mediaType: LlmImageMediaType;
    readonly data: Uint8Array;
}

export interface LlmFileBlock {
    readonly kind: 'file';
    readonly mediaType: typeof LLM_FILE_MEDIA_TYPE;
    readonly data: Uint8Array;
}

export type LlmMediaBlock = LlmImageBlock | LlmFileBlock;

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock | LlmImageBlock | LlmFileBlock;

export interface LlmMessage {
    readonly role: 'user' | 'assistant';
    readonly content: string | readonly LlmContentBlock[];
}

export interface LlmToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: JsonObject;
}

export interface LlmUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
}

export const EMPTY_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

export interface LlmGenerationRequest {
    readonly task: LlmTask;
    readonly feature: LlmFeature;
    readonly system: string;
    readonly messages: readonly LlmMessage[];
    readonly responseSchema?: JsonObject;
    readonly tools?: readonly LlmToolDefinition[];
    readonly referenceId?: string;
}

export interface LlmGenerationResponse {
    readonly text: string;
    readonly toolUses: readonly LlmToolUse[];
    readonly stopReason: LlmStopReason;
    readonly usage: LlmUsage;
    readonly costMicros: number;
    readonly callId: string;
}

export type LlmCredentials =
    | { readonly driver: 'gateway'; readonly apiKey: string; readonly modelId: string }
    | { readonly driver: 'openai_compatible'; readonly baseUrl: string; readonly apiKey: string; readonly modelId: string };

export type LlmProbeResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: 'unauthorized' | 'model_not_found' | 'unreachable' | 'timeout' | 'invalid_response' };

export type LlmProbeFailure = Extract<LlmProbeResult, { ok: false }>['reason'];
