import { Injectable } from '@nestjs/common';
import { LLM_TASK_CATALOG } from '../../../core/llm/catalog/llm-task.catalog';
import { LlmTaskSpec } from '../../../core/llm/catalog/llm-task.types';
import { LlmInvalidResponseError } from '../../../core/llm/llm.errors';
import { LlmPort } from '../../../core/llm/llm.port';
import { JsonObject, LlmGenerationResponse, LlmMessage } from '../../../core/llm/llm.types';
import { parseJsonObject } from '../../../core/llm/structured-output';
import { toolInputSchemaOf } from '../../../core/llm/tool-input-schema';
import { AppLocale } from '../../../shared/i18n/locale';
import { AiContext, BuiltContext } from '../domain/context/ai-context.types';
import { serializeContext } from '../domain/context/context-hash';
import { AiTextRenderer } from '../domain/context/ai-text-renderer';
import { summarySystemPromptOf } from '../domain/prompts/summary-prompts';
import { GuardCheck, GuardResult, guardSummary } from '../domain/summary-guard';
import { summaryOutputSchema } from '../domain/summary-output.schemas';
import { SUMMARY_TASKS, GeneratedSummaryKind } from '../domain/summary.types';
import { AiAssistantLogService } from './ai-assistant-log.service';
import { AiAssistantMetricsService } from './ai-assistant-metrics.service';

const MAX_ATTEMPTS: number = 2;
const RESPONSE_SCHEMA: JsonObject = toolInputSchemaOf(summaryOutputSchema);

export interface GenerateRequest {
    readonly kind: GeneratedSummaryKind;
    readonly periodKey: string;
    readonly built: BuiltContext<AiContext>;
    readonly locale: AppLocale;
}

export interface GeneratedSummary {
    readonly paragraphs: readonly string[];
    readonly callId: string;
    readonly promptVersion: number;
}

type Attempt =
    | { readonly ok: true; readonly paragraphs: readonly string[]; readonly callId: string; readonly costMicros: number }
    | { readonly ok: false; readonly check: GuardCheck; readonly detail: string; readonly text: string; readonly costMicros: number };

function specOf(kind: GeneratedSummaryKind): LlmTaskSpec {
    const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find((item: LlmTaskSpec): boolean => item.task === SUMMARY_TASKS[kind]);
    if (spec === undefined) {
        throw new Error(`task "${SUMMARY_TASKS[kind]}" is not in the LLM task catalog`);
    }
    return spec;
}

export function promptVersionOf(kind: GeneratedSummaryKind): number {
    return Number(specOf(kind).promptVersion.replaceAll(/\D/g, ''));
}

function failedAttempt(response: LlmGenerationResponse, check: GuardCheck, detail: string): Attempt {
    return { ok: false, check, detail, text: response.text, costMicros: response.costMicros };
}

function correctionOf(attempt: Extract<Attempt, { ok: false }>): readonly LlmMessage[] {
    if (attempt.text === '') {
        return [];
    }
    return [
        { role: 'assistant', content: attempt.text },
        {
            role: 'user',
            content: `The previous answer failed the check "${attempt.check}": ${attempt.detail}. Write the summary again as the same JSON, fixing that problem.`
        }
    ];
}

@Injectable()
export class SummaryGeneratorService {
    public constructor(
        private readonly llm: LlmPort,
        private readonly renderer: AiTextRenderer,
        private readonly logs: AiAssistantLogService,
        private readonly metrics: AiAssistantMetricsService
    ) {}

    public async generate(request: GenerateRequest): Promise<GeneratedSummary> {
        let messages: readonly LlmMessage[] = [{ role: 'user', content: serializeContext(request.built.payload) }];
        let costMicros: number = 0;
        for (let round: number = 1; round <= MAX_ATTEMPTS; round += 1) {
            const attempt: Attempt = await this.attempt(request, messages, round);
            costMicros += attempt.costMicros;
            if (attempt.ok) {
                this.logs.summaryGenerated(request.kind, 'model', round, costMicros);
                this.metrics.summary(request.kind, 'generated');
                return { paragraphs: attempt.paragraphs, callId: attempt.callId, promptVersion: promptVersionOf(request.kind) };
            }
            this.logs.summaryGuardFailed(request.kind, attempt.check, round);
            this.metrics.summaryGuardFailure(request.kind, attempt.check);
            messages = [...messages, ...correctionOf(attempt)];
        }
        this.metrics.summary(request.kind, 'invalid');
        throw new LlmInvalidResponseError(SUMMARY_TASKS[request.kind]);
    }

    private async attempt(request: GenerateRequest, messages: readonly LlmMessage[], round: number): Promise<Attempt> {
        const response: LlmGenerationResponse | null = await this.ask(request, messages, round);
        if (response === null) {
            return { ok: false, check: 'schema', detail: 'the answer was not a JSON object', text: '', costMicros: 0 };
        }
        return this.checked(request, response);
    }

    private checked(request: GenerateRequest, response: LlmGenerationResponse): Attempt {
        const parsed: ReturnType<typeof summaryOutputSchema.safeParse> = summaryOutputSchema.safeParse(parseJsonObject(response.text));
        if (!parsed.success) {
            return failedAttempt(response, 'schema', parsed.error.issues[0]?.message ?? 'invalid shape');
        }
        const guarded: GuardResult = guardSummary({
            paragraphs: parsed.data.paragraphs,
            built: request.built,
            locale: request.locale,
            renderer: this.renderer
        });
        if (!guarded.ok) {
            return failedAttempt(response, guarded.check, guarded.detail);
        }
        return { ok: true, paragraphs: guarded.paragraphs, callId: response.callId, costMicros: response.costMicros };
    }

    private async ask(request: GenerateRequest, messages: readonly LlmMessage[], round: number): Promise<LlmGenerationResponse | null> {
        try {
            return await this.llm.generate({
                task: SUMMARY_TASKS[request.kind],
                feature: 'ai',
                system: summarySystemPromptOf(request.kind, request.locale),
                messages,
                responseSchema: RESPONSE_SCHEMA,
                referenceId: `summary:${request.kind}:${request.periodKey}:${String(round)}`
            });
        } catch (error: unknown) {
            if (error instanceof LlmInvalidResponseError) {
                return null;
            }
            throw error;
        }
    }
}
