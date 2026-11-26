import { Injectable } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { LogService } from '../../observability/log.service';
import { LlmProviderUnavailableError, LlmUnsupportedContentError } from '../llm.errors';
import { LlmContentBlock, LlmMessage } from '../llm.types';
import { AiSdkLlmDriver, AttemptMode, CallOptions } from './ai-sdk-llm.driver';
import { LlmDriverCall, LlmDriverResult } from './llm-driver';
import { ProviderCallError } from './provider-failures';

const PROVIDER_NAME: string = 'self-hosted';

function hostOfUrl(baseUrl: string): string | null {
    try {
        return new URL(baseUrl).host;
    } catch {
        return null;
    }
}

@Injectable()
export class OpenAiCompatibleLlmDriver extends AiSdkLlmDriver {
    protected readonly identifier: string = 'llm-openai-compatible';

    public constructor(logService: LogService) {
        super(logService);
    }

    public override async generate(call: LlmDriverCall): Promise<LlmDriverResult> {
        this.assertNoFiles(call);
        try {
            return await this.generateIn(call, { textOnly: false });
        } catch (error: unknown) {
            if (!this.formatRefused(call, error)) {
                throw error;
            }
            this.logService.warn({
                message: 'structured output refused: repeating once in text mode',
                identifier: this.identifier,
                meta: { task: call.request.task, host: this.hostOf(call) }
            });
            return this.generateIn(call, { textOnly: true });
        }
    }

    protected languageModelOf(call: LlmDriverCall): LanguageModel {
        if (call.credentials.driver !== 'openai_compatible') {
            throw new ProviderCallError(null, 'credentials are not openai compatible', false);
        }
        const provider: ReturnType<typeof createOpenAICompatible> = createOpenAICompatible({
            name: PROVIDER_NAME,
            baseURL: call.credentials.baseUrl,
            apiKey: call.credentials.apiKey,
            supportsStructuredOutputs: true,
            fetch: (input: string | URL | Request, init?: RequestInit): Promise<Response> => fetch(input, { ...init, redirect: 'error' })
        });
        return provider(call.credentials.modelId);
    }

    protected providerOptionsOf(_call: LlmDriverCall): CallOptions['providerOptions'] {
        return undefined;
    }

    protected hostOf(call: LlmDriverCall): string | null {
        return call.credentials.driver === 'openai_compatible' ? hostOfUrl(call.credentials.baseUrl) : null;
    }

    protected override systemOf(call: LlmDriverCall, mode: AttemptMode): string {
        if (!mode.textOnly || call.request.responseSchema === undefined) {
            return call.request.system;
        }
        return `${call.request.system}\n\nAnswer only with one JSON object that follows this JSON Schema: ${JSON.stringify(call.request.responseSchema)}`;
    }

    private assertNoFiles(call: LlmDriverCall): void {
        const file: LlmContentBlock | undefined = call.request.messages
            .flatMap((message: LlmMessage): readonly LlmContentBlock[] => (typeof message.content === 'string' ? [] : message.content))
            .find((block: LlmContentBlock): boolean => block.kind === 'file');
        if (file?.kind === 'file') {
            throw new LlmUnsupportedContentError(call.request.task, file.mediaType);
        }
    }

    private formatRefused(call: LlmDriverCall, error: unknown): boolean {
        return (
            call.request.responseSchema !== undefined &&
            error instanceof LlmProviderUnavailableError &&
            error.cause instanceof ProviderCallError &&
            error.cause.refusedRequest
        );
    }
}
