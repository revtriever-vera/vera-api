import { LLM_TASKS, LlmFeature, LlmGenerationRequest, JsonObject } from '../../../core/llm/llm.types';
import { toolInputSchemaOf } from '../../../core/llm/tool-input-schema';
import type { AppLocale } from '../../../shared/i18n/locale';
import { marketDocumentSummaryOutputSchema } from './market-document-summary.schemas';
import { marketDocumentSummaryPromptOf } from './market-document-summary.prompt';
import { SummarySubject } from './market-document-summary.types';

export const MARKET_DOCS_FEATURE: LlmFeature = 'market_docs';
export const SUMMARY_RESPONSE_SCHEMA: JsonObject = toolInputSchemaOf(marketDocumentSummaryOutputSchema);

export function summaryPayloadOf(subject: SummarySubject, locale: AppLocale): string {
    return JSON.stringify({
        issuer: subject.issuerName,
        tickers: subject.tickers,
        category: subject.category,
        publishedAt: subject.publishedAt,
        language: locale,
        text: subject.text
    });
}

export function summaryRequestOf(documentId: string, subject: SummarySubject, locale: AppLocale, round: number): LlmGenerationRequest {
    return {
        task: LLM_TASKS.marketDocumentSummary,
        feature: MARKET_DOCS_FEATURE,
        system: marketDocumentSummaryPromptOf(locale),
        messages: [{ role: 'user', content: summaryPayloadOf(subject, locale) }],
        responseSchema: SUMMARY_RESPONSE_SCHEMA,
        referenceId: `market-doc:${documentId}:${locale}:${String(round)}`
    };
}
