import { Selectable } from 'kysely';
import { AiSummaries } from '../../../core/database/generated/database.types';
import { UsageStateKey } from '../../../core/usage/usage.types';
import { AiPayloadKind } from './ai-assistant.types';
import { AiContext, BuiltContext } from './context/ai-context.types';

export type SummaryKind = AiPayloadKind;

export const MONTHLY_REVIEW_KIND = 'monthly_review' as const;

export type GeneratedSummaryKind = SummaryKind | typeof MONTHLY_REVIEW_KIND;

export const SUMMARY_SOURCES = { model: 'model', fixed: 'fixed' } as const;

export type SummarySourceKind = (typeof SUMMARY_SOURCES)[keyof typeof SUMMARY_SOURCES];

export const SUMMARY_TASKS = {
    month: 'summary_month',
    cuts: 'summary_cuts',
    portfolio: 'summary_portfolio',
    monthly_review: 'summary_monthly_review'
} as const;

export type AiSummary = Selectable<AiSummaries>;

export interface SummaryContext {
    readonly periodKey: string;
    readonly contextHash: string;
    readonly built: BuiltContext<AiContext>;
}

export interface FixedSummary {
    readonly periodKey: string;
    readonly paragraphs: readonly string[];
}

export type SummarySubject =
    { readonly mode: 'model'; readonly context: SummaryContext } | { readonly mode: 'fixed'; readonly fixed: FixedSummary };

export interface SummaryUsage {
    readonly state: UsageStateKey;
    readonly usedBps: number;
    readonly resetsAt: string;
}

export interface SummaryView {
    readonly kind: SummaryKind;
    readonly period: string;
    readonly paragraphs: readonly string[];
    readonly generatedAt: string;
    readonly cached: boolean;
    readonly stale: boolean;
    readonly source: SummarySourceKind;
    readonly usage: SummaryUsage;
}

export interface SaveSummaryInput {
    readonly kind: GeneratedSummaryKind;
    readonly periodKey: string;
    readonly locale: string;
    readonly contextHash: string;
    readonly paragraphs: readonly string[];
    readonly promptVersion: number;
    readonly llmCallId: string | null;
    readonly auto: boolean;
}

export interface SummaryExport {
    readonly kind: string;
    readonly period: string;
    readonly locale: string;
    readonly source: string;
    readonly generatedAt: string;
    readonly paragraphs: readonly string[];
}
