import { Injectable } from '@nestjs/common';
import { LlmTaskSpec } from '../catalog/llm-task.types';
import { GatewayLlmDriver } from '../drivers/gateway-llm.driver';
import { LlmDriver } from '../drivers/llm-driver';
import { OpenAiCompatibleLlmDriver } from '../drivers/openai-compatible-llm.driver';
import { ProviderCallError } from '../drivers/provider-failures';
import { LlmProviderUnavailableError } from '../llm.errors';
import { LLM_TASKS, LlmCredentials, LlmProbeResult } from '../llm.types';

const PROBE_TASK: string = 'credentials_probe';
const PROBE_TIMEOUT_MS: number = 10_000;

const PROBE_SPEC: LlmTaskSpec = {
    task: LLM_TASKS.askVeraStep,
    maxOutputTokens: 1,
    maxCostMicros: 0,
    temperature: 0,
    timeoutMs: PROBE_TIMEOUT_MS,
    maxRetries: 0,
    evalThreshold: 0,
    promptVersion: 'probe'
};

@Injectable()
export class LlmProbeService {
    public constructor(
        private readonly gateway: GatewayLlmDriver,
        private readonly openaiCompatible: OpenAiCompatibleLlmDriver
    ) {}

    public async test(credentials: LlmCredentials): Promise<LlmProbeResult> {
        const driver: LlmDriver = credentials.driver === 'gateway' ? this.gateway : this.openaiCompatible;
        try {
            await driver.generate({
                credentials,
                spec: PROBE_SPEC,
                request: { task: PROBE_TASK, system: 'Connectivity check.', messages: [{ role: 'user', content: 'ping' }] }
            });
            return { ok: true };
        } catch (error: unknown) {
            if (error instanceof LlmProviderUnavailableError && error.cause instanceof ProviderCallError) {
                return { ok: false, reason: error.cause.probeReason };
            }
            return { ok: false, reason: 'unreachable' };
        }
    }
}
