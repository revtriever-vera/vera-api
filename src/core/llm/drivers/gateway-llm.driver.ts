import { Injectable } from '@nestjs/common';
import { createGateway } from 'ai';
import type { LanguageModel } from 'ai';
import { JsonObject } from '../llm.types';
import { strictWireSchemaOf } from '../structured-output';
import { LogService } from '../../observability/log.service';
import { AiSdkLlmDriver, CallOptions, TextResult } from './ai-sdk-llm.driver';
import { LlmDriverCall, LlmDriverResult } from './llm-driver';
import { fieldValueOf } from './provider-failures';

const MODEL_OWNER_SEPARATOR: string = '/';

export function pinnedProviderOf(modelId: string): string {
    return modelId.split(MODEL_OWNER_SEPARATOR)[0] ?? modelId;
}

@Injectable()
export class GatewayLlmDriver extends AiSdkLlmDriver {
    protected readonly identifier: string = 'llm-gateway';

    public constructor(logService: LogService) {
        super(logService);
    }

    protected languageModelOf(call: LlmDriverCall): LanguageModel {
        return createGateway({ apiKey: call.credentials.apiKey })(call.credentials.modelId);
    }

    protected providerOptionsOf(call: LlmDriverCall): CallOptions['providerOptions'] {
        return { gateway: { only: [pinnedProviderOf(call.credentials.modelId)] } };
    }

    protected hostOf(_call: LlmDriverCall): string | null {
        return null;
    }

    protected override wireSchemaOf(schema: JsonObject): JsonObject {
        return strictWireSchemaOf(schema);
    }

    protected override noteAnswer(call: LlmDriverCall, answer: LlmDriverResult): void {
        if (answer.servedModelId === null || answer.servedModelId === call.credentials.modelId) {
            return;
        }
        this.logService.warn({
            message: 'gateway served another model than the pinned one',
            identifier: this.identifier,
            meta: { task: call.request.task, modelId: call.credentials.modelId, servedModelId: answer.servedModelId }
        });
    }

    protected override servedModelIdOf(result: TextResult): string | null {
        const slug: unknown = fieldValueOf(result.finalStep.providerMetadata, ['gateway', 'routing', 'canonicalSlug']);
        return typeof slug === 'string' && slug.length > 0 ? slug : null;
    }

    protected override providerCostUsdOf(result: TextResult): number | null {
        const cost: unknown = fieldValueOf(result.finalStep.providerMetadata, ['gateway', 'cost']);
        const parsed: number = typeof cost === 'string' || typeof cost === 'number' ? Number(cost) : Number.NaN;
        return Number.isFinite(parsed) ? parsed : null;
    }
}
