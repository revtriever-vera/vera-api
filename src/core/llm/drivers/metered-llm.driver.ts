import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HashUtil } from '../../../shared/utils/hash.util';
import { IdUtil } from '../../../shared/utils/id.util';
import { CapReachedError } from '../../usage/usage.errors';
import { LlmTaskSpec } from '../catalog/llm-task.types';
import { llmConfig } from '../config/llm.config';
import { LlmInvalidResponseError, LlmProviderDisabledError, LlmRepeatedRequestError } from '../llm.errors';
import { LlmPort } from '../llm.port';
import {
    EMPTY_USAGE,
    LlmContentBlock,
    LlmCredentials,
    LlmDriverName,
    LlmGenerationRequest,
    LlmGenerationResponse,
    LlmMessage,
    LlmOutcome,
    LlmUsage,
    JsonObject
} from '../llm.types';
import { credentialsForRole } from '../services/llm-vision-model';
import { LlmCredentialsPort } from '../ports/llm-credentials.port';
import { LlmLedgerEntry, LlmLedgerService } from '../services/llm-ledger.service';
import { LlmPricingService } from '../services/llm-pricing.service';
import { LlmTaskRegistryService } from '../services/llm-task-registry.service';
import { parseJsonObject } from '../structured-output';
import { LlmDriverResult } from './llm-driver';
import { LlmDriverRouter } from './llm-driver-router';

const CHARS_PER_TOKEN_ESTIMATE: number = 3;
const IMAGE_TOKENS_ESTIMATE: number = 1_600;
const FILE_BYTES_PER_TOKEN_ESTIMATE: number = 50;
const REPEAT_WINDOW_MS: number = 24 * 3_600_000;

interface Route {
    readonly driver: LlmDriverName;
    readonly credentials: LlmCredentials;
}

interface Call {
    readonly callId: string;
    readonly request: LlmGenerationRequest;
    readonly spec: LlmTaskSpec;
    readonly route: Route;
    readonly requestHash: string;
    readonly estimateMicros: number;
}

@Injectable()
export class MeteredLlmDriver extends LlmPort {
    public constructor(
        @Inject(llmConfig.KEY) private readonly config: ConfigType<typeof llmConfig>,
        private readonly registry: LlmTaskRegistryService,
        private readonly credentials: LlmCredentialsPort,
        private readonly pricing: LlmPricingService,
        private readonly router: LlmDriverRouter,
        private readonly ledger: LlmLedgerService
    ) {
        super();
    }

    public async generate(requested: LlmGenerationRequest): Promise<LlmGenerationResponse> {
        const spec: LlmTaskSpec = this.registry.resolve(requested.task);
        const request: LlmGenerationRequest = this.withSpecSchema(requested, spec);
        const route: Route = await this.routeOf(spec);
        const call: Call = await this.prepare(request, spec, route);
        await this.assertRoom(call);
        await this.assertNotRepeated(call);
        const result: LlmDriverResult = await this.run(call);
        return this.finish(call, result);
    }

    private withSpecSchema(request: LlmGenerationRequest, spec: LlmTaskSpec): LlmGenerationRequest {
        const responseSchema: JsonObject | undefined = request.responseSchema ?? spec.responseSchema;
        return responseSchema === undefined ? request : { ...request, responseSchema };
    }

    private async routeOf(spec: LlmTaskSpec): Promise<Route> {
        if (this.config.LLM_DRIVER === 'mock') {
            return { driver: 'mock', credentials: { driver: 'gateway', apiKey: '', modelId: this.config.LLM_MODEL_ID } };
        }
        const credentials: LlmCredentials | null = await this.credentials.resolve();
        if (credentials === null) {
            throw new LlmProviderDisabledError();
        }
        return {
            driver: credentials.driver,
            credentials: credentialsForRole(credentials, spec.model, this.config.LLM_VISION_MODEL)
        };
    }

    private async prepare(request: LlmGenerationRequest, spec: LlmTaskSpec, route: Route): Promise<Call> {
        const body: string = JSON.stringify({
            task: request.task,
            system: request.system,
            messages: request.messages.map((message: LlmMessage): unknown => this.fingerprintOf(message)),
            tools: request.tools ?? null,
            responseSchema: request.responseSchema ?? null
        });
        const usage: LlmUsage = {
            ...EMPTY_USAGE,
            inputTokens: Math.ceil(body.length / CHARS_PER_TOKEN_ESTIMATE) + this.mediaTokensOf(request),
            outputTokens: spec.maxOutputTokens
        };
        return {
            callId: IdUtil.newId(),
            request,
            spec,
            route,
            requestHash: HashUtil.sha256(body),
            estimateMicros: await this.pricing.costMicros(route.credentials.modelId, usage)
        };
    }

    private fingerprintOf(message: LlmMessage): unknown {
        if (typeof message.content === 'string') {
            return message;
        }
        return {
            role: message.role,
            content: message.content.map((block: LlmContentBlock): unknown =>
                block.kind === 'image' || block.kind === 'file'
                    ? { kind: block.kind, mediaType: block.mediaType, bytes: block.data.byteLength, sha256: HashUtil.sha256(block.data) }
                    : block
            )
        };
    }

    private mediaTokensOf(request: LlmGenerationRequest): number {
        return request.messages
            .flatMap((message: LlmMessage): readonly LlmContentBlock[] => (typeof message.content === 'string' ? [] : message.content))
            .reduce((total: number, block: LlmContentBlock): number => total + this.tokensOfBlock(block), 0);
    }

    private tokensOfBlock(block: LlmContentBlock): number {
        if (block.kind === 'image') {
            return IMAGE_TOKENS_ESTIMATE;
        }
        return block.kind === 'file' ? Math.ceil(block.data.byteLength / FILE_BYTES_PER_TOKEN_ESTIMATE) : 0;
    }

    private async assertRoom(call: Call): Promise<void> {
        try {
            await this.ledger.assertRoom(call.request.feature, call.request.task, call.estimateMicros);
        } catch (error: unknown) {
            if (error instanceof CapReachedError) {
                await this.ledger.record(this.entryOf(call, 'cap_reached', null));
            }
            throw error;
        }
    }

    private async assertNotRepeated(call: Call): Promise<void> {
        const since: Date = new Date(Date.now() - REPEAT_WINDOW_MS);
        const answered: number = await this.ledger.answeredSince(call.requestHash, since);
        if (answered > this.config.LLM_REPEAT_LIMIT) {
            throw new LlmRepeatedRequestError(call.request.task, answered);
        }
    }

    private async run(call: Call): Promise<LlmDriverResult> {
        const startedAt: number = performance.now();
        try {
            return await this.router.driverFor(call.route.driver).generate({
                credentials: call.route.credentials,
                request: call.request,
                spec: call.spec
            });
        } catch (error: unknown) {
            await this.ledger.record({
                ...this.entryOf(call, 'failed', null),
                latencyMs: Math.round(performance.now() - startedAt),
                attempts: this.attemptsOf(error)
            });
            throw error;
        }
    }

    private attemptsOf(error: unknown): number {
        const attempts: unknown = typeof error === 'object' && error !== null ? (error as { attempts?: unknown }).attempts : undefined;
        return typeof attempts === 'number' ? attempts : 1;
    }

    private async finish(call: Call, result: LlmDriverResult): Promise<LlmGenerationResponse> {
        const costMicros: number = await this.pricing.costMicros(call.route.credentials.modelId, result.usage);
        const outcome: LlmOutcome = this.readable(call.request, result) ? 'answered' : 'invalid';
        await this.ledger.record({
            ...this.entryOf(call, outcome, result),
            costMicros,
            gatewayCostMicros: result.providerCostUsd === null ? null : await this.pricing.usdToMicros(result.providerCostUsd)
        });
        if (outcome === 'invalid') {
            throw new LlmInvalidResponseError(call.request.task);
        }
        return {
            text: result.text,
            toolUses: result.toolUses,
            stopReason: result.stopReason,
            usage: result.usage,
            costMicros,
            callId: call.callId
        };
    }

    private readable(request: LlmGenerationRequest, result: LlmDriverResult): boolean {
        if (request.responseSchema === undefined || result.toolUses.length > 0) {
            return true;
        }
        return parseJsonObject(result.text) !== null;
    }

    private entryOf(call: Call, outcome: LlmOutcome, result: LlmDriverResult | null): LlmLedgerEntry {
        return {
            callId: call.callId,
            task: call.request.task,
            feature: call.request.feature,
            driver: call.route.driver,
            modelId: call.route.credentials.modelId,
            servedModelId: result?.servedModelId ?? null,
            usage: result?.usage ?? EMPTY_USAGE,
            costMicros: 0,
            gatewayCostMicros: null,
            estimateMicros: call.estimateMicros,
            latencyMs: result?.latencyMs ?? 0,
            attempts: result?.attempts ?? 0,
            outcome,
            requestHash: call.requestHash,
            referenceId: call.request.referenceId ?? null
        };
    }
}
