import { generateText, jsonSchema, Output } from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import { LogService } from '../../observability/log.service';
import { LlmProviderUnavailableError } from '../llm.errors';
import { JsonObject, LlmToolUse } from '../llm.types';
import { aiSdkMessagesOf, aiSdkStopReasonOf, aiSdkToolInputOf, aiSdkToolsOf, aiSdkUsageOf } from './ai-sdk-messages';
import { callSignalOf } from './call-signal';
import { LlmDriver, LlmDriverCall, LlmDriverResult } from './llm-driver';
import { ProviderCallError, providerCallErrorOf } from './provider-failures';

const BASE_DELAY_MS: number = 500;

export type TextResult = Awaited<ReturnType<typeof generateText>>;
export type CallOptions = Parameters<typeof generateText>[0];

export interface AttemptMode {
    readonly textOnly: boolean;
}

export abstract class AiSdkLlmDriver extends LlmDriver {
    protected abstract readonly identifier: string;

    protected constructor(protected readonly logService: LogService) {
        super();
    }

    protected abstract languageModelOf(call: LlmDriverCall): LanguageModel;

    protected abstract providerOptionsOf(call: LlmDriverCall): CallOptions['providerOptions'];

    protected abstract hostOf(call: LlmDriverCall): string | null;

    public async generate(call: LlmDriverCall): Promise<LlmDriverResult> {
        return this.generateIn(call, { textOnly: false });
    }

    protected wireSchemaOf(schema: JsonObject): JsonObject {
        return schema;
    }

    protected systemOf(call: LlmDriverCall, _mode: AttemptMode): string {
        return call.request.system;
    }

    protected async generateIn(call: LlmDriverCall, mode: AttemptMode): Promise<LlmDriverResult> {
        const model: LanguageModel = this.languageModelOf(call);
        const attempts: number = call.spec.maxRetries + 1;
        let lastError: ProviderCallError = new ProviderCallError(null, 'no detail', false);
        for (let attempt: number = 1; attempt <= attempts; attempt += 1) {
            const outcome: LlmDriverResult | ProviderCallError = await this.attemptOnce(model, call, mode, attempt);
            if (!(outcome instanceof ProviderCallError)) {
                return outcome;
            }
            lastError = outcome;
            this.warnAttempt(call, lastError, attempt);
            if (!lastError.retryable || attempt === attempts) {
                throw this.givenUp(call, lastError, attempt);
            }
            await this.delay(BASE_DELAY_MS * 2 ** (attempt - 1));
        }
        throw this.givenUp(call, lastError, attempts);
    }

    private async attemptOnce(
        model: LanguageModel,
        call: LlmDriverCall,
        mode: AttemptMode,
        attempt: number
    ): Promise<LlmDriverResult | ProviderCallError> {
        const startedAt: number = performance.now();
        try {
            const result: TextResult = await this.runOnce(model, call, mode);
            const answer: LlmDriverResult = this.resultOf(result, attempt, Math.round(performance.now() - startedAt));
            this.noteAnswer(call, answer);
            return answer;
        } catch (error: unknown) {
            return error instanceof ProviderCallError ? error : providerCallErrorOf(error, false);
        }
    }

    protected async runOnce(model: LanguageModel, call: LlmDriverCall, mode: AttemptMode): Promise<TextResult> {
        const signal: AbortSignal = callSignalOf(call.spec.timeoutMs);
        try {
            return await generateText(this.optionsOf(model, call, mode, signal));
        } catch (error: unknown) {
            throw providerCallErrorOf(error, signal.aborted);
        }
    }

    private optionsOf(model: LanguageModel, call: LlmDriverCall, mode: AttemptMode, abortSignal: AbortSignal): CallOptions {
        const { request, spec }: LlmDriverCall = call;
        const tools: ToolSet | undefined =
            request.tools === undefined || request.tools.length === 0 ? undefined : aiSdkToolsOf(request.tools);
        const structured: boolean = request.responseSchema !== undefined && !mode.textOnly;
        return {
            model,
            system: this.systemOf(call, mode),
            messages: aiSdkMessagesOf(request.messages),
            ...(tools === undefined ? {} : { tools }),
            ...(structured && request.responseSchema !== undefined
                ? { output: Output.object({ schema: jsonSchema(this.wireSchemaOf(request.responseSchema)) }) }
                : {}),
            maxOutputTokens: spec.maxOutputTokens,
            temperature: spec.temperature,
            reasoning: spec.reasoning,
            providerOptions: this.providerOptionsOf(call),
            maxRetries: 0,
            abortSignal
        };
    }

    private resultOf(result: TextResult, attempts: number, latencyMs: number): LlmDriverResult {
        const toolUses: LlmToolUse[] = result.toolCalls.map((part): LlmToolUse => ({
            toolUseId: part.toolCallId,
            name: part.toolName,
            input: aiSdkToolInputOf(part.input)
        }));
        return {
            text: result.text.trim(),
            toolUses,
            stopReason: aiSdkStopReasonOf(result.finishReason, toolUses.length > 0),
            usage: aiSdkUsageOf(result.usage),
            servedModelId: this.servedModelIdOf(result),
            providerCostUsd: this.providerCostUsdOf(result),
            attempts,
            latencyMs
        };
    }

    protected noteAnswer(_call: LlmDriverCall, _answer: LlmDriverResult): void {
        return;
    }

    protected servedModelIdOf(_result: TextResult): string | null {
        return null;
    }

    protected providerCostUsdOf(_result: TextResult): number | null {
        return null;
    }

    private warnAttempt(call: LlmDriverCall, error: ProviderCallError, attempt: number): void {
        this.logService.warn({
            message: 'provider call failed',
            identifier: this.identifier,
            meta: {
                task: call.request.task,
                modelId: call.credentials.modelId,
                host: this.hostOf(call),
                attempt,
                maxAttempts: call.spec.maxRetries + 1,
                retryable: error.retryable,
                status: error.status,
                reason: error.logReason
            }
        });
    }

    private givenUp(call: LlmDriverCall, error: ProviderCallError, attempts: number): LlmProviderUnavailableError {
        this.logService.error({
            message: 'provider did not answer: generation abandoned',
            identifier: this.identifier,
            meta: { task: call.request.task, status: error.status, attempts, host: this.hostOf(call) }
        });
        return new LlmProviderUnavailableError(error.logReason, attempts, error);
    }

    private async delay(ms: number): Promise<void> {
        return new Promise<void>((resolve: () => void) => {
            setTimeout(resolve, ms);
        });
    }
}
