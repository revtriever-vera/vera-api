import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { LLM_TASK_CATALOG } from '../../../core/llm/catalog/llm-task.catalog';
import { LlmTaskSpec } from '../../../core/llm/catalog/llm-task.types';
import { LlmInvalidResponseError } from '../../../core/llm/llm.errors';
import { LlmPort } from '../../../core/llm/llm.port';
import { LLM_TASKS, LlmGenerationRequest, LlmGenerationResponse, LlmMessage } from '../../../core/llm/llm.types';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { parseJsonObject } from '../../../core/llm/structured-output';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { DEFAULT_LOCALE } from '../../../shared/i18n/locale';
import type { AppLocale } from '../../../shared/i18n/locale';
import { compareCodeUnits } from '../../../shared/utils/compare-code-units';
import { DateUtil } from '../../../shared/utils/date.util';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { marketDocumentsConfig } from '../config/market-documents.config';
import { MarketDocumentSummaryDomain } from '../domain/market-document-summary.domain';
import { guardDocumentSummary, SummaryGuardCheck, SummaryGuardResult } from '../domain/market-document-summary-guard';
import { summaryRequestOf } from '../domain/market-document-summary.request';
import { MarketDocumentSummaryOutput, marketDocumentSummaryOutputSchema } from '../domain/market-document-summary.schemas';
import { ExtractedDocument, SUMMARY_OUTCOMES, SummaryOutcome, SummarySubject } from '../domain/market-document-summary.types';
import { MarketDocumentDomain } from '../domain/market-document.domain';
import { MarketDocumentsLogService } from './market-documents-log.service';
import { MarketDocumentsMetricsService } from './market-documents-metrics.service';

const MAX_ROUNDS: number = 2;

type Round =
    | { readonly ok: true; readonly output: MarketDocumentSummaryOutput; readonly callId: string; readonly costMicros: number }
    | { readonly ok: false; readonly check: string; readonly detail: string; readonly text: string; readonly costMicros: number };

function promptVersionOf(): string {
    const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find(
        (entry: LlmTaskSpec): boolean => entry.task === LLM_TASKS.marketDocumentSummary
    );
    if (spec === undefined) {
        throw new Error(`task "${LLM_TASKS.marketDocumentSummary}" is not in the LLM task catalog`);
    }
    return spec.promptVersion;
}

function correctionOf(round: Extract<Round, { ok: false }>): readonly LlmMessage[] {
    if (round.text === '') {
        return [];
    }
    return [
        { role: 'assistant', content: round.text },
        {
            role: 'user',
            content: `The previous answer failed the check "${round.check}": ${round.detail}. Write the answer again as the same JSON, fixing that problem.`
        }
    ];
}

@Injectable()
export class MarketDocumentSummarizerService {
    public constructor(
        @Inject(marketDocumentsConfig.KEY) private readonly config: ConfigType<typeof marketDocumentsConfig>,
        private readonly llm: LlmPort,
        private readonly availability: LlmAvailabilityService,
        private readonly assets: AssetCatalogService,
        private readonly documents: MarketDocumentDomain,
        private readonly summaries: MarketDocumentSummaryDomain,
        private readonly metrics: MarketDocumentsMetricsService,
        private readonly logs: MarketDocumentsLogService
    ) {}

    public async summarizePending(): Promise<number> {
        if (!(await this.availability.enabled())) {
            return 0;
        }
        const pending: ExtractedDocument[] = await this.documents.findExtracted(this.config.MARKET_DOC_SUMMARY_BATCH);
        let summarized: number = 0;
        for (const [index, document] of pending.entries()) {
            const outcome: SummaryOutcome | null = await this.attempt(document, pending.length - index);
            if (outcome === null) {
                break;
            }
            summarized += outcome === SUMMARY_OUTCOMES.generated || outcome === SUMMARY_OUTCOMES.cached ? 1 : 0;
        }
        return summarized;
    }

    public async summarize(document: ExtractedDocument, locale: AppLocale = DEFAULT_LOCALE): Promise<SummaryOutcome> {
        const version: string = promptVersionOf();
        if ((await this.summaries.findCurrent(document.id, locale, version)) !== null) {
            await this.documents.markSummarized(document.id);
            this.metrics.summary(SUMMARY_OUTCOMES.cached);
            return SUMMARY_OUTCOMES.cached;
        }
        const subject: SummarySubject = await this.subjectOf(document);
        return this.generated(document, locale, version, subject);
    }

    private async attempt(document: ExtractedDocument, remaining: number): Promise<SummaryOutcome | null> {
        try {
            return await this.summarize(document);
        } catch (error: unknown) {
            if (error instanceof CapReachedError) {
                this.logs.summaryCapReached(remaining);
                return null;
            }
            await this.documents.recordSummaryAttempt(document, this.config.MARKET_DOC_MAX_ATTEMPTS);
            this.logs.summaryFailed(document.id, document.attempts + 1, error);
            this.metrics.summary(SUMMARY_OUTCOMES.failed);
            return SUMMARY_OUTCOMES.failed;
        }
    }

    private async generated(
        document: ExtractedDocument,
        locale: AppLocale,
        version: string,
        subject: SummarySubject
    ): Promise<SummaryOutcome> {
        let extra: readonly LlmMessage[] = [];
        let costMicros: number = 0;
        for (let round: number = 1; round <= MAX_ROUNDS; round += 1) {
            const result: Round = await this.ask(document, subject, locale, round, extra);
            costMicros += result.costMicros;
            if (result.ok) {
                await this.store(document, locale, version, result);
                this.finish(document.id, SUMMARY_OUTCOMES.generated, round, costMicros);
                return SUMMARY_OUTCOMES.generated;
            }
            this.logs.summaryGuardFailed(document.id, result.check, round);
            extra = [...extra, ...correctionOf(result)];
        }
        await this.documents.markSummaryFailed(document.id);
        this.finish(document.id, SUMMARY_OUTCOMES.invalid, MAX_ROUNDS, costMicros);
        return SUMMARY_OUTCOMES.invalid;
    }

    private finish(documentId: string, outcome: SummaryOutcome, rounds: number, costMicros: number): void {
        this.metrics.summary(outcome);
        this.metrics.summaryCost(costMicros);
        this.logs.summarized(documentId, outcome, rounds, costMicros);
    }

    private async store(
        document: ExtractedDocument,
        locale: AppLocale,
        version: string,
        result: Extract<Round, { ok: true }>
    ): Promise<void> {
        await this.summaries.save({
            documentId: document.id,
            locale,
            promptVersion: version,
            summary: result.output.summary,
            kind: result.output.kind,
            relevance: result.output.relevance,
            discard: result.output.discard,
            llmCallId: result.callId
        });
        await this.documents.markSummarized(document.id);
    }

    private async ask(
        document: ExtractedDocument,
        subject: SummarySubject,
        locale: AppLocale,
        round: number,
        extra: readonly LlmMessage[]
    ): Promise<Round> {
        const base: LlmGenerationRequest = summaryRequestOf(document.id, subject, locale, round);
        const response: LlmGenerationResponse | null = await this.call({ ...base, messages: [...base.messages, ...extra] });
        if (response === null) {
            return { ok: false, check: 'schema', detail: 'the answer was not a JSON object', text: '', costMicros: 0 };
        }
        return this.checked(response, document.text);
    }

    private checked(response: LlmGenerationResponse, sourceText: string): Round {
        const parsed: ReturnType<typeof marketDocumentSummaryOutputSchema.safeParse> = marketDocumentSummaryOutputSchema.safeParse(
            parseJsonObject(response.text)
        );
        if (!parsed.success) {
            return this.rejected(response, 'schema', parsed.error.issues[0]?.message ?? 'invalid shape');
        }
        const guarded: SummaryGuardResult = guardDocumentSummary(parsed.data, sourceText);
        if (!guarded.ok) {
            const check: SummaryGuardCheck = guarded.check;
            return this.rejected(response, check, guarded.detail);
        }
        return { ok: true, output: parsed.data, callId: response.callId, costMicros: response.costMicros };
    }

    private rejected(response: LlmGenerationResponse, check: string, detail: string): Round {
        return { ok: false, check, detail, text: response.text, costMicros: response.costMicros };
    }

    private async call(request: LlmGenerationRequest): Promise<LlmGenerationResponse | null> {
        try {
            return await this.llm.generate(request);
        } catch (error: unknown) {
            if (error instanceof LlmInvalidResponseError) {
                return null;
            }
            throw error;
        }
    }

    private async subjectOf(document: ExtractedDocument): Promise<SummarySubject> {
        const found: Asset[] = await this.assets.findManyByIds(document.assetIds);
        return {
            issuerName: found[0]?.name ?? '',
            tickers: found.map((asset: Asset): string => asset.symbol).sort(compareCodeUnits),
            category: document.category,
            publishedAt: DateUtil.onlyDateString(document.publishedAt),
            text: document.text
        };
    }
}
