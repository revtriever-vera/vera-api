import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { retentionCutoffOf } from '../../../core/usage/usage-period';
import { RETENTION_MONTHS, UsageState } from '../../../core/usage/usage.types';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { AppLocale } from '../../../shared/i18n/locale';
import { AiSummaryDomain } from '../domain/ai-summary.domain';
import { storedParagraphsSchema } from '../domain/summary-output.schemas';
import { cacheDecisionOf, CacheDecision } from '../domain/summary-cache.policy';
import {
    AiSummary,
    FixedSummary,
    SUMMARY_SOURCES,
    SummaryContext,
    SummaryKind,
    SummarySourceKind,
    SummarySubject,
    SummaryView
} from '../domain/summary.types';
import { AiAssistantLogService } from '../services/ai-assistant-log.service';
import { AiAssistantMetricsService } from '../services/ai-assistant-metrics.service';
import { AiConsentService } from '../services/ai-consent.service';
import { GeneratedSummary, SummaryGeneratorService } from '../services/summary-generator.service';
import { SummarySubjectService } from '../services/summary-subject.service';
import { SummaryQuery } from '../validation/summaries.schemas';

interface ViewParts {
    readonly kind: SummaryKind;
    readonly periodKey: string;
    readonly paragraphs: readonly string[];
    readonly generatedAt: Date;
    readonly cached: boolean;
    readonly stale: boolean;
    readonly source: SummarySourceKind;
}

@Injectable()
export class SummariesApplication {
    public constructor(
        private readonly subjects: SummarySubjectService,
        private readonly generator: SummaryGeneratorService,
        private readonly stored: AiSummaryDomain,
        private readonly consent: AiConsentService,
        private readonly meter: PaidUsageMeter,
        private readonly context: AppContext,
        private readonly logs: AiAssistantLogService,
        private readonly metrics: AiAssistantMetricsService
    ) {}

    public async get(kind: SummaryKind, input: SummaryQuery): Promise<SummaryView | null> {
        return this.resolve(kind, input, false);
    }

    public async regenerate(kind: SummaryKind, input: SummaryQuery): Promise<SummaryView | null> {
        return this.resolve(kind, input, true);
    }

    public async purgeExpired(): Promise<number> {
        return this.stored.purgeBefore(retentionCutoffOf(new Date(), RETENTION_MONTHS));
    }

    private async resolve(kind: SummaryKind, input: SummaryQuery, force: boolean): Promise<SummaryView | null> {
        const subject: SummarySubject | null = await this.subjects.of(kind, input);
        if (subject === null) {
            return null;
        }
        if (subject.mode === 'fixed') {
            return this.fixed(kind, subject.fixed);
        }
        await this.consent.assertGranted();
        return this.modelled(kind, subject.context, force);
    }

    private async fixed(kind: SummaryKind, fixed: FixedSummary): Promise<SummaryView> {
        this.logs.summaryServed(kind, false, SUMMARY_SOURCES.fixed);
        this.metrics.summary(kind, 'fixed');
        return this.view({
            kind,
            periodKey: fixed.periodKey,
            paragraphs: fixed.paragraphs,
            generatedAt: new Date(),
            cached: false,
            stale: false,
            source: SUMMARY_SOURCES.fixed
        });
    }

    private async modelled(kind: SummaryKind, context: SummaryContext, force: boolean): Promise<SummaryView> {
        const locale: AppLocale = this.context.get().locale;
        const stored: AiSummary | null = await this.stored.findStored(kind, context.periodKey, locale);
        const decision: CacheDecision = force ? 'generate' : cacheDecisionOf(stored, context.contextHash, new Date());
        if (stored !== null && decision !== 'generate') {
            return this.fromStored(kind, context, stored, decision === 'stale');
        }
        if (force) {
            this.metrics.summaryRegeneration(kind);
        }
        return this.generatedOrStored(kind, context, locale, force, stored);
    }

    /** Com a cota pausada, o texto guardado segue valendo (mesmo velho): só gerar um novo fica bloqueado. */
    private async generatedOrStored(
        kind: SummaryKind,
        context: SummaryContext,
        locale: AppLocale,
        force: boolean,
        stored: AiSummary | null
    ): Promise<SummaryView> {
        try {
            return await this.generated(kind, context, locale, !force);
        } catch (error: unknown) {
            if (!force && stored !== null && error instanceof CapReachedError) {
                return this.fromStored(kind, context, stored, true);
            }
            throw error;
        }
    }

    private async fromStored(kind: SummaryKind, context: SummaryContext, stored: AiSummary, stale: boolean): Promise<SummaryView> {
        this.logs.summaryServed(kind, true, SUMMARY_SOURCES.model);
        this.metrics.summary(kind, 'cached');
        return this.view({
            kind,
            periodKey: context.periodKey,
            paragraphs: storedParagraphsSchema.parse(stored.paragraphs),
            generatedAt: stored.generatedAt,
            cached: true,
            stale,
            source: SUMMARY_SOURCES.model
        });
    }

    private async generated(kind: SummaryKind, context: SummaryContext, locale: AppLocale, auto: boolean): Promise<SummaryView> {
        const result: GeneratedSummary = await this.generateOrCount(kind, context, locale);
        const saved: AiSummary = await this.stored.save({
            kind,
            periodKey: context.periodKey,
            locale,
            contextHash: context.contextHash,
            paragraphs: result.paragraphs,
            promptVersion: result.promptVersion,
            llmCallId: result.callId,
            auto
        });
        return this.view({
            kind,
            periodKey: context.periodKey,
            paragraphs: result.paragraphs,
            generatedAt: saved.generatedAt,
            cached: false,
            stale: false,
            source: SUMMARY_SOURCES.model
        });
    }

    private async generateOrCount(kind: SummaryKind, context: SummaryContext, locale: AppLocale): Promise<GeneratedSummary> {
        try {
            return await this.generator.generate({ kind, periodKey: context.periodKey, built: context.built, locale });
        } catch (error: unknown) {
            if (error instanceof CapReachedError) {
                this.metrics.summary(kind, 'cap_reached');
            }
            throw error;
        }
    }

    private async view(parts: ViewParts): Promise<SummaryView> {
        const usage: UsageState = await this.meter.state();
        return {
            kind: parts.kind,
            period: parts.periodKey.split(':')[0] ?? parts.periodKey,
            paragraphs: parts.paragraphs,
            generatedAt: parts.generatedAt.toISOString(),
            cached: parts.cached,
            stale: parts.stale,
            source: parts.source,
            usage: { state: usage.state, usedBps: usage.usedBps, resetsAt: usage.resetsAt }
        };
    }
}
