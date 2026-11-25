import { loadEnvFile } from 'node:process';
import { GatewayLlmDriver } from '../../src/core/llm/drivers/gateway-llm.driver';
import { LlmTaskSpec } from '../../src/core/llm/catalog/llm-task.types';
import { LlmDriverResult } from '../../src/core/llm/drivers/llm-driver';
import { LlmPort } from '../../src/core/llm/llm.port';
import { LlmGenerationRequest, LlmGenerationResponse } from '../../src/core/llm/llm.types';
import { LogService } from '../../src/core/observability/log.service';
import { AppContext } from '../../src/core/context/app-context.port';
import { LlmAvailabilityService } from '../../src/core/llm/services/llm-availability.service';
import { ThrottleService } from '../../src/core/throttle/throttle.service';
import { Asset, AssetCatalogService } from '../../src/modules/catalog/services/asset-catalog.service';
import { ParsedInvestmentStatement } from '../../src/modules/investment-import/domain/investment-statement.types';
import { InvestmentImportLogService } from '../../src/modules/investment-import/services/investment-import-log.service';
import { ModelReaderService } from '../../src/modules/investment-import/services/model-reader.service';
import { NoteAssetResolverService } from '../../src/modules/investment-import/services/note-asset-resolver.service';
import { specOf } from './generate';
import { noteCasesOf, noteCatalogOf, noteFileOf, NoteCase, problemsOfNoteStatement } from './investment-extract-cases';

const DEFAULT_MODEL_ID: string = 'meta/muse-spark-1.3-contributor';
const SILENT_LOG: Pick<LogService, 'warn' | 'error'> = { warn: (): void => undefined, error: (): void => undefined };

function gatewayKey(): string {
    const key: string | undefined = process.env['AI_GATEWAY_API_KEY'] ?? process.env['VERCEL_AI_GATEWAY_API_KEY'];
    if (key === undefined || key === '') {
        throw new Error('no gateway key in EVALS_SECRETS_FILE (AI_GATEWAY_API_KEY or VERCEL_AI_GATEWAY_API_KEY)');
    }
    return key;
}

class LiveLlm extends LlmPort {
    public costUsd: number = 0;
    private readonly driver: GatewayLlmDriver = new GatewayLlmDriver(SILENT_LOG as LogService);

    public constructor(private readonly modelId: string) {
        super();
    }

    public async generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse> {
        const spec: LlmTaskSpec = specOf(request.task, undefined);
        const result: LlmDriverResult = await this.driver.generate({
            credentials: { driver: 'gateway', apiKey: gatewayKey(), modelId: this.modelId },
            spec,
            request: spec.responseSchema === undefined ? request : { ...request, responseSchema: spec.responseSchema }
        });
        this.costUsd += result.providerCostUsd ?? 0;
        if (process.env['EVALS_SHOW_ANSWER'] === '1') {
            process.stdout.write(`answer: ${result.text}\n`);
        }
        return {
            text: result.text,
            toolUses: result.toolUses,
            stopReason: result.stopReason,
            usage: result.usage,
            costMicros: 0,
            callId: '1'
        };
    }
}

function catalogOf(): AssetCatalogService {
    const entries: Asset[] = noteCatalogOf().map((entry): Asset => ({ ...entry, market: 'B3' }) as unknown as Asset);
    return {
        searchByName: (_market: string, name: string): Promise<Asset[]> =>
            Promise.resolve(entries.filter((entry: Asset): boolean => entry.name.toLowerCase().includes(name.toLowerCase())))
    } as unknown as AssetCatalogService;
}

async function runCase(reader: ModelReaderService, item: NoteCase): Promise<string[]> {
    try {
        const statement: ParsedInvestmentStatement = await reader.read(new Uint8Array(noteFileOf(item)), true);
        return problemsOfNoteStatement(item, statement);
    } catch (error: unknown) {
        return [`failed: ${error instanceof Error ? error.message : 'unknown error'}`];
    }
}

function readerOf(llm: LiveLlm): ModelReaderService {
    return new ModelReaderService(
        llm,
        { enabled: (): Promise<boolean> => Promise.resolve(true) } as unknown as LlmAvailabilityService,
        { assertAllowed: (): Promise<void> => Promise.resolve() } as unknown as ThrottleService,
        { get: (): { readonly companyId: string } => ({ companyId: 'evals' }) } as unknown as AppContext,
        { modelRead: (): void => undefined, modelFailed: (): void => undefined } as unknown as InvestmentImportLogService,
        new NoteAssetResolverService(catalogOf())
    );
}

function casesOf(only: string | undefined): NoteCase[] {
    return noteCasesOf().filter((candidate: NoteCase): boolean => only === undefined || candidate.id === only);
}

function lineOf(item: NoteCase, problems: readonly string[]): string {
    return `${problems.length === 0 ? 'PASS' : 'FAIL'} ${item.id}${problems.length === 0 ? '' : `\n  ${problems.join('\n  ')}`}\n`;
}

async function main(): Promise<number> {
    loadEnvFile(process.env['EVALS_SECRETS_FILE']);
    const llm: LiveLlm = new LiveLlm(process.env['EVALS_MODEL'] ?? DEFAULT_MODEL_ID);
    const reader: ModelReaderService = readerOf(llm);
    let failed: number = 0;
    for (const item of casesOf(process.argv[2])) {
        const problems: string[] = await runCase(reader, item);
        failed += problems.length === 0 ? 0 : 1;
        process.stdout.write(lineOf(item, problems));
    }
    process.stdout.write(`cost: US$ ${llm.costUsd.toFixed(4)}; failed cases: ${String(failed)}\n`);
    return failed === 0 ? 0 : 1;
}

main().then(
    (code: number): void => {
        process.exitCode = code;
    },
    (error: unknown): void => {
        process.stderr.write(`${error instanceof Error ? error.message : 'eval failed'}\n`);
        process.exitCode = 2;
    }
);
