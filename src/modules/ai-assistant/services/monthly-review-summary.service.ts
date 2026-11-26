import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { LlmInvalidResponseError } from '../../../core/llm/llm.errors';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { AppLocale } from '../../../shared/i18n/locale';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { AI_FEATURE } from '../domain/ai-assistant.types';
import { AiMonthlyReviewContext, BuiltContext, ReviewClassLabel, ReviewSource } from '../domain/context/ai-context.types';
import { AiSummaryDomain } from '../domain/ai-summary.domain';
import { CacheDecision, cacheDecisionOf } from '../domain/summary-cache.policy';
import { storedParagraphsSchema } from '../domain/summary-output.schemas';
import { AiSummary, MONTHLY_REVIEW_KIND, SUMMARY_TASKS } from '../domain/summary.types';
import { AiAssistantMetricsService } from './ai-assistant-metrics.service';
import { AiConsentService } from './ai-consent.service';
import { AiContextBuilderService } from './ai-context-builder.service';
import { GeneratedSummary, SummaryGeneratorService } from './summary-generator.service';

export interface MonthlyReviewSummaryInput {
    readonly review: ReviewSource;
    readonly labels: readonly ReviewClassLabel[];
}

export type { ReviewClassLabel, ReviewSource };

export interface StoredMonthlyReviewSummary {
    readonly paragraphs: readonly string[];
    readonly generatedAt: Date;
}

@Injectable()
export class MonthlyReviewSummaryService {
    public constructor(
        private readonly builder: AiContextBuilderService,
        private readonly generator: SummaryGeneratorService,
        private readonly stored: AiSummaryDomain,
        private readonly consent: AiConsentService,
        private readonly gate: PlanGateService,
        private readonly context: AppContext,
        private readonly metrics: AiAssistantMetricsService
    ) {}

    public async storedOf(month: string): Promise<StoredMonthlyReviewSummary | null> {
        const row: AiSummary | null = await this.stored.findStored(MONTHLY_REVIEW_KIND, month, this.context.get().locale);
        return row === null ? null : { paragraphs: storedParagraphsSchema.parse(row.paragraphs), generatedAt: row.generatedAt };
    }

    public async paragraphsOf(input: MonthlyReviewSummaryInput): Promise<readonly string[] | null> {
        if (!(await this.gate.allows(AI_FEATURE)) || !(await this.consent.isGranted())) {
            return null;
        }
        const locale: AppLocale = this.context.get().locale;
        const built: BuiltContext<AiMonthlyReviewContext> = this.builtOf(input);
        const hash: string = this.builder.hash(built.payload, SUMMARY_TASKS.monthly_review);
        const row: AiSummary | null = await this.stored.findStored(MONTHLY_REVIEW_KIND, input.review.month, locale);
        const decision: CacheDecision = cacheDecisionOf(row, hash, new Date());
        if (row !== null && decision !== 'generate') {
            this.metrics.summary(MONTHLY_REVIEW_KIND, 'cached');
            return storedParagraphsSchema.parse(row.paragraphs);
        }
        return this.generated(input.review.month, { built, hash, locale }, row);
    }

    private builtOf(input: MonthlyReviewSummaryInput): BuiltContext<AiMonthlyReviewContext> {
        return this.builder.monthlyReview(input.review, input.labels);
    }

    private async generated(
        month: string,
        request: { readonly built: BuiltContext<AiMonthlyReviewContext>; readonly hash: string; readonly locale: AppLocale },
        previous: AiSummary | null
    ): Promise<readonly string[] | null> {
        try {
            const result: GeneratedSummary = await this.generator.generate({
                kind: MONTHLY_REVIEW_KIND,
                periodKey: month,
                built: request.built,
                locale: request.locale
            });
            await this.save(month, request, result);
            return result.paragraphs;
        } catch (error: unknown) {
            return this.fallback(error, previous);
        }
    }

    private async save(
        month: string,
        request: { readonly hash: string; readonly locale: AppLocale },
        result: GeneratedSummary
    ): Promise<void> {
        await this.stored.save({
            kind: MONTHLY_REVIEW_KIND,
            periodKey: month,
            locale: request.locale,
            contextHash: request.hash,
            paragraphs: result.paragraphs,
            promptVersion: result.promptVersion,
            llmCallId: result.callId,
            auto: true
        });
    }

    private fallback(error: unknown, previous: AiSummary | null): readonly string[] | null {
        if (error instanceof CapReachedError) {
            this.metrics.summary(MONTHLY_REVIEW_KIND, 'cap_reached');
            return previous === null ? null : storedParagraphsSchema.parse(previous.paragraphs);
        }
        if (error instanceof LlmInvalidResponseError) {
            return null;
        }
        throw error;
    }
}
