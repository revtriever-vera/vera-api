import { loadEnvFile } from 'node:process';
import { GatewayLlmDriver } from '../../src/core/llm/drivers/gateway-llm.driver';
import { LlmDriver } from '../../src/core/llm/drivers/llm-driver';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { OpenAiCompatibleLlmDriver } from '../../src/core/llm/drivers/openai-compatible-llm.driver';
import { LlmCredentials } from '../../src/core/llm/llm.types';
import { LogService } from '../../src/core/observability/log.service';

export type EvalMode = 'mock' | 'live';

export interface EngineOptions {
    readonly mode: EvalMode;
    readonly baseUrl: string | undefined;
    readonly model: string | undefined;
    readonly maxUsd: number;
}

export class BudgetExceededError extends Error {
    public constructor(spentUsd: number, maxUsd: number) {
        super(`spent US$ ${spentUsd.toFixed(4)} of the US$ ${maxUsd.toFixed(2)} budget`);
    }
}

const DEFAULT_MODEL_ID: string = 'meta/muse-spark-1.3-contributor';
const DEFAULT_USD_BRL: number = 5.5;
const SILENT_LOG: Pick<LogService, 'warn' | 'error'> = { warn: (): void => undefined, error: (): void => undefined };

export class Engine {
    public spentUsd: number = 0;

    public constructor(
        public readonly mode: EvalMode,
        public readonly driver: LlmDriver,
        public readonly credentials: LlmCredentials,
        public readonly usdBrl: number,
        private readonly maxUsd: number
    ) {}

    public assertBudget(): void {
        if (this.spentUsd >= this.maxUsd) {
            throw new BudgetExceededError(this.spentUsd, this.maxUsd);
        }
    }

    public mock(): MockLlmDriver | null {
        return this.driver instanceof MockLlmDriver ? this.driver : null;
    }
}

function secretsLoaded(): void {
    const file: string | undefined = process.env['EVALS_SECRETS_FILE'];
    if (file === undefined || file === '') {
        throw new Error('live mode needs EVALS_SECRETS_FILE pointing to a local file outside the repository');
    }
    loadEnvFile(file);
    if (process.env['LLM_DRIVER'] !== 'live') {
        throw new Error('live mode needs LLM_DRIVER=live');
    }
}

function liveEngine(options: EngineOptions, usdBrl: number): Engine {
    secretsLoaded();
    const modelId: string = options.model ?? process.env['LLM_MODEL_ID'] ?? DEFAULT_MODEL_ID;
    const logs: LogService = SILENT_LOG as LogService;
    if (options.baseUrl !== undefined) {
        const apiKey: string = process.env['EVALS_API_KEY'] ?? gatewayKey();
        const credentials: LlmCredentials = { driver: 'openai_compatible', baseUrl: options.baseUrl, apiKey, modelId };
        return new Engine('live', new OpenAiCompatibleLlmDriver(logs), credentials, usdBrl, options.maxUsd);
    }
    return new Engine('live', new GatewayLlmDriver(logs), { driver: 'gateway', apiKey: gatewayKey(), modelId }, usdBrl, options.maxUsd);
}

function gatewayKey(): string {
    const key: string | undefined = process.env['AI_GATEWAY_API_KEY'] ?? process.env['VERCEL_AI_GATEWAY_API_KEY'];
    if (key === undefined || key === '') {
        throw new Error('no gateway key in the secrets file (AI_GATEWAY_API_KEY or VERCEL_AI_GATEWAY_API_KEY)');
    }
    return key;
}

export function engineOf(options: EngineOptions): Engine {
    const usdBrl: number = Number(process.env['EVALS_USD_BRL'] ?? DEFAULT_USD_BRL);
    if (options.mode === 'live') {
        return liveEngine(options, usdBrl);
    }
    return new Engine('mock', new MockLlmDriver(), { driver: 'gateway', apiKey: '', modelId: 'mock' }, usdBrl, options.maxUsd);
}
