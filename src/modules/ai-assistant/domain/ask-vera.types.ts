import type { ZodTypeAny } from 'zod';
import { JsonObject } from '../../../core/llm/llm.types';
import { UsageStateKey } from '../../../core/usage/usage.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { AskRoute } from './ask-channel-profiles';
import { LabelSource } from './context/ai-context.types';

export const ASK_VERA_MAX_STEPS: number = 4;
export const ASK_VERA_MAX_HISTORY: number = 6;
export const ASK_VERA_MAX_QUESTION_CHARS: number = 1000;
export const ASK_VERA_MAX_TOOL_BYTES: number = 8192;
export const ASK_VERA_FEATURE = 'whatsapp' as const;
export const ASK_VERA_HELP_FEATURE = 'help' as const;

export const ASK_VERA_TOOL_KINDS = { read: 'read', proposal: 'proposal', direct: 'direct' } as const;

export type AskVeraToolKind = (typeof ASK_VERA_TOOL_KINDS)[keyof typeof ASK_VERA_TOOL_KINDS];

export interface AskVeraTurn {
    readonly role: 'person' | 'vera';
    readonly text: string;
}

export interface AskVeraScreen {
    readonly path: string;
}

export type AskVeraInput = AskRoute & {
    readonly screen?: AskVeraScreen;
    readonly text: string;
    readonly history: readonly AskVeraTurn[];
    readonly locale: AppLocale;
    readonly messageId: string;
    readonly allowedTools: ReadonlySet<string>;
    readonly extraTools?: readonly AskVeraTool[];
    readonly importAttached?: boolean;
};

export interface AskVeraProposal {
    readonly tool: string;
    readonly summary: string;
    readonly payload: JsonObject;
}

export interface AskVeraUsage {
    readonly state: UsageStateKey;
    readonly usedBps: number;
    readonly resetsAt: string;
}

export interface AskVeraSent {
    readonly tool: string;
    readonly payload: JsonObject;
}

export interface AskVeraAnswer {
    readonly text: string;
    readonly notice: boolean;
    readonly sent: readonly AskVeraSent[];
    readonly source: 'model' | 'fixed';
    readonly toolsUsed: readonly string[];
    readonly proposals: readonly AskVeraProposal[];
    readonly truncated: boolean;
    readonly usage: AskVeraUsage;
}

export type AskVeraOutcome = 'model' | 'fixed_refusal' | 'fixed_greeting' | 'fallback' | 'cap_reached';

export const INVESTMENT_NOTICE_TOOLS: ReadonlySet<string> = new Set([
    'portfolio_overview',
    'contribution_suggestion',
    'goals_overview',
    'concentration_overview',
    'fixed_income_maturities',
    'market_benchmarks',
    'asset_lookup',
    'fund_performance',
    'fixed_income_vs_benchmark',
    'portfolio_news'
]);

export interface AskVeraToolProposal {
    readonly summary: string;
    readonly payload: JsonObject;
}

export interface AskVeraToolOutput {
    readonly payload: JsonObject;
    readonly numbers?: readonly number[];
    readonly keys?: ReadonlyMap<string, LabelSource>;
    readonly text?: string;
    readonly proposal?: AskVeraToolProposal;
}

export interface AskVeraTool {
    readonly name: string;
    readonly kind: AskVeraToolKind;
    readonly inputSchema: ZodTypeAny;
    description(locale: AppLocale): string;
    run(input: unknown): Promise<AskVeraToolOutput>;
}
