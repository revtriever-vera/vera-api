import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { LlmContentBlock, LlmGenerationRequest, LlmGenerationResponse, LlmMessage } from '../../../core/llm/llm.types';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import {
    noteCasesOf,
    noteCatalogOf,
    noteFileOf,
    NoteCase,
    problemsOfNoteStatement
} from '../../../../evals/runner/investment-extract-cases';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { ParsedInvestmentStatement } from '../domain/investment-statement.types';
import { InvestmentImportLogService } from './investment-import-log.service';
import { ModelReaderService } from './model-reader.service';
import { NoteAssetResolverService } from './note-asset-resolver.service';

const CASES: NoteCase[] = noteCasesOf();

function response(text: string): LlmGenerationResponse {
    return {
        text,
        toolUses: [],
        stopReason: 'end',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
        costMicros: 1000,
        callId: 'c'
    };
}

function catalogOf(): AssetCatalogService {
    const entries: Asset[] = noteCatalogOf().map((entry): Asset => ({ ...entry, market: 'B3' }) as unknown as Asset);
    return {
        searchByName: vi
            .fn()
            .mockImplementation((_market: string, name: string): Promise<Asset[]> =>
                Promise.resolve(entries.filter((entry: Asset): boolean => entry.name.toLowerCase().includes(name.toLowerCase())))
            )
    } as unknown as AssetCatalogService;
}

function build(): { readonly reader: ModelReaderService; readonly generate: ReturnType<typeof vi.fn> } {
    const generate = vi.fn();
    const reader: ModelReaderService = new ModelReaderService(
        { generate },
        { enabled: vi.fn().mockResolvedValue(true) } as unknown as LlmAvailabilityService,
        { assertAllowed: vi.fn().mockResolvedValue(undefined) } as unknown as ThrottleService,
        { get: () => ({ companyId: 'company-1' }) } as unknown as AppContext,
        { modelRead: vi.fn(), modelFailed: vi.fn() } as unknown as InvestmentImportLogService,
        new NoteAssetResolverService(catalogOf())
    );
    return { reader, generate };
}

function blocksOf(request: LlmGenerationRequest): LlmContentBlock[] {
    return request.messages.flatMap((message: LlmMessage): readonly LlmContentBlock[] =>
        typeof message.content === 'string' ? [] : message.content
    );
}

function textOf(request: LlmGenerationRequest): string {
    return blocksOf(request)
        .map((block: LlmContentBlock): string => (block.kind === 'text' ? block.text : ''))
        .join('\n');
}

describe('ModelReaderService com as notas sintéticas', () => {
    const textCases: NoteCase[] = CASES.filter((item: NoteCase): boolean => item.input === 'text');

    it.each(textCases.map((item: NoteCase): [string, NoteCase] => [item.id, item]))(
        '%s: nenhum CPF, nome ou código de cliente sai na requisição com texto',
        async (_id: string, item: NoteCase) => {
            const kit = build();
            kit.generate.mockResolvedValue(response(JSON.stringify(item.modelAnswer)));

            await kit.reader.read(new Uint8Array(noteFileOf(item)), true);

            const sent: string = JSON.stringify(
                kit.generate.mock.calls.map((call: unknown[]): string => textOf(call[0] as LlmGenerationRequest))
            );
            expect(kit.generate).toHaveBeenCalledTimes(1);
            expect(sent).toContain('Liquido para');
            for (const secret of item.personalData) {
                expect(sent).not.toContain(secret);
            }
            expect(
                blocksOf(kit.generate.mock.calls[0]?.[0] as LlmGenerationRequest).every(
                    (block: LlmContentBlock): boolean => block.kind === 'text'
                )
            ).toBe(true);
        }
    );

    it.each(CASES.map((item: NoteCase): [string, NoteCase] => [item.id, item]))(
        '%s: a resposta do modelo, o catálogo e o pós-processamento dão as linhas do gabarito',
        async (_id: string, item: NoteCase) => {
            const kit = build();
            kit.generate.mockResolvedValue(response(JSON.stringify(item.modelAnswer)));

            const statement: ParsedInvestmentStatement = await kit.reader.read(new Uint8Array(noteFileOf(item)), true);

            expect(problemsOfNoteStatement(item, statement)).toEqual([]);
        }
    );

    it('a nota escaneada vai como arquivo de página, sem texto da nota', async () => {
        const scanned: NoteCase = CASES.find((item: NoteCase): boolean => item.input === 'image') as NoteCase;
        const kit = build();
        kit.generate.mockResolvedValue(response(JSON.stringify(scanned.modelAnswer)));

        await kit.reader.read(new Uint8Array(noteFileOf(scanned)), true);

        const blocks: LlmContentBlock[] = blocksOf(kit.generate.mock.calls[0]?.[0] as LlmGenerationRequest);
        expect(blocks.map((block: LlmContentBlock): string => block.kind)).toEqual(['text', 'file']);
        expect(textOf(kit.generate.mock.calls[0]?.[0] as LlmGenerationRequest)).not.toContain('PETROBRAS');
    });
});
