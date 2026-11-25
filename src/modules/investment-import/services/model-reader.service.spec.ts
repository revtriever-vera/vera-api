import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { LlmInvalidResponseError, LlmProviderDisabledError } from '../../../core/llm/llm.errors';
import { LlmContentBlock, LlmGenerationRequest, LlmGenerationResponse, LlmMessage } from '../../../core/llm/llm.types';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { ThrottleService, TooManyAttemptsError } from '../../../core/throttle/throttle.service';
import { ParsedInvestmentStatement } from '../domain/investment-statement.types';
import { ModelReaderService } from './model-reader.service';
import { InvestmentImportLogService } from './investment-import-log.service';

const NOTE_TEXT: string = 'Bovespa C VISTA PETROBRAS PN N2 PETR4 100 38,50 3.850,00 D';
const SECRETS: readonly string[] = ['PESSOA EXEMPLO', '111.222.333-96', '123456-7'];

const OPERATION: Record<string, unknown> = {
    kind: 'buy',
    direction: 'credit',
    tradeDate: '2026-11-03',
    ticker: 'PETR4',
    quantity: '100',
    unitPrice: '38.5',
    grossMinor: 385000,
    currency: 'BRL'
};

function answer(operations: unknown[] = [OPERATION], extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ documentType: 'note', currency: 'BRL', totalMinor: null, operations, ...extra });
}

function response(text: string, costMicros: number = 1000): LlmGenerationResponse {
    return {
        text,
        toolUses: [],
        stopReason: 'end',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
        costMicros,
        callId: 'c'
    };
}

async function textPdf(lines: readonly string[], pages: number = 1): Promise<Uint8Array> {
    const document: PDFDocument = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (let index: number = 0; index < pages; index += 1) {
        const page = document.addPage([595, 842]);
        lines.forEach((line: string, row: number): void => {
            page.drawText(line, { x: 20, y: 800 - row * 14, size: 10, font });
        });
    }
    return document.save();
}

async function scannedPdf(pages: number): Promise<Uint8Array> {
    const document: PDFDocument = await PDFDocument.create();
    for (let index: number = 0; index < pages; index += 1) {
        document.addPage([595, 842]);
    }
    return document.save();
}

async function png(width: number, height: number): Promise<Uint8Array> {
    return new Uint8Array(
        await sharp({ create: { width, height, channels: 3, background: '#fff' } })
            .png()
            .toBuffer()
    );
}

function build(): {
    readonly reader: ModelReaderService;
    readonly generate: ReturnType<typeof vi.fn>;
    readonly enabled: ReturnType<typeof vi.fn>;
    readonly assertAllowed: ReturnType<typeof vi.fn>;
    readonly logs: Record<string, ReturnType<typeof vi.fn>>;
} {
    const generate = vi.fn();
    const enabled = vi.fn().mockResolvedValue(true);
    const assertAllowed = vi.fn().mockResolvedValue(undefined);
    const logs: Record<string, ReturnType<typeof vi.fn>> = { modelRead: vi.fn(), modelFailed: vi.fn() };
    const reader: ModelReaderService = new ModelReaderService(
        { generate },
        { enabled } as unknown as LlmAvailabilityService,
        { assertAllowed } as unknown as ThrottleService,
        { get: () => ({ companyId: 'company-1' }) } as unknown as AppContext,
        logs as unknown as InvestmentImportLogService
    );
    return { reader, generate, enabled, assertAllowed, logs };
}

function textsOf(request: LlmGenerationRequest): string {
    return request.messages
        .flatMap((message: LlmMessage): readonly LlmContentBlock[] => (typeof message.content === 'string' ? [] : message.content))
        .map((block: LlmContentBlock): string => (block.kind === 'text' ? block.text : ''))
        .join('\n');
}

describe('ModelReaderService', () => {
    let kit: ReturnType<typeof build>;

    beforeEach(() => {
        kit = build();
        kit.generate.mockResolvedValue(response(answer()));
    });

    it('só PDF e imagem vão ao modelo; planilha e CSV seguem para o leitor fixo', async () => {
        expect(kit.reader.accepts(await textPdf([NOTE_TEXT]))).toBe(true);
        expect(kit.reader.accepts(await png(10, 10))).toBe(true);
        expect(kit.reader.accepts(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(false);
        expect(kit.reader.accepts(new TextEncoder().encode('Data;Valor'))).toBe(false);
    });

    it('sem modelo configurado devolve model.unavailable, antes de pedir confirmação', async () => {
        kit.enabled.mockResolvedValue(false);

        await expect(kit.reader.read(await png(10, 10), false)).rejects.toMatchObject({ code: 'model.unavailable' });
        expect(kit.generate).not.toHaveBeenCalled();
    });

    it('sem modelConsent devolve model.confirmation_required e nada sai', async () => {
        await expect(kit.reader.read(await textPdf([NOTE_TEXT]), false)).rejects.toMatchObject({
            code: 'model.confirmation_required',
            status: 428
        });
        await expect(kit.reader.read(await png(10, 10), false)).rejects.toMatchObject({ code: 'model.confirmation_required' });
        expect(kit.generate).not.toHaveBeenCalled();
        expect(kit.assertAllowed).not.toHaveBeenCalled();
    });

    it('com consentimento, a nota em PDF vira extrato do modelo', async () => {
        const statement: ParsedInvestmentStatement = await kit.reader.read(await textPdf([NOTE_TEXT]), true);

        expect(statement.source).toBe('model');
        expect(statement.documentType).toBe('note');
        expect(statement.operations).toHaveLength(1);
        expect(kit.generate).toHaveBeenCalledTimes(1);
        expect(kit.generate.mock.calls[0]?.[0]).toMatchObject({ task: 'investment_extract', feature: 'ai' });
        expect(kit.assertAllowed).toHaveBeenCalledWith('investment-import-model:company-1', 30, 3600);
    });

    it('o print vira uma chamada com a imagem reduzida', async () => {
        await kit.reader.read(await png(3000, 1000), true);

        const request: LlmGenerationRequest = kit.generate.mock.calls[0]?.[0] as LlmGenerationRequest;
        const blocks: LlmContentBlock[] = request.messages.flatMap((message) =>
            typeof message.content === 'string' ? [] : [...message.content]
        );
        const image = blocks.find((block: LlmContentBlock) => block.kind === 'image');
        expect(image?.kind === 'image' && image.mediaType).toBe('image/png');
        expect(image?.kind === 'image' && (await sharp(image.data).metadata()).width).toBe(2000);
    });

    it('nota envenenada: nome, CPF e código do cliente não saem na requisição montada', async () => {
        const pdf: Uint8Array = await textPdf([
            'NOTA DE NEGOCIACAO Nr. nota 4567 Data pregao 03/11/2026',
            'Cliente',
            'PESSOA EXEMPLO 123456-7',
            'C.P.F./C.N.P.J./Vinculo',
            '111.222.333-96',
            'Titular: PESSOA EXEMPLO',
            NOTE_TEXT
        ]);

        await kit.reader.read(pdf, true);

        const request: LlmGenerationRequest = kit.generate.mock.calls[0]?.[0] as LlmGenerationRequest;
        const sent: string = `${request.system}\n${textsOf(request)}`;
        for (const secret of SECRETS) {
            expect(sent).not.toContain(secret);
        }
        expect(sent).toContain('PETR4 100 38,50');
        expect(sent).toContain('03/11/2026');
    });

    it('PDF escaneado vai uma página por chamada, até 10 páginas', async () => {
        kit.generate.mockResolvedValue(response(answer()));

        const statement: ParsedInvestmentStatement = await kit.reader.read(await scannedPdf(3), true);

        expect(kit.generate).toHaveBeenCalledTimes(3);
        expect(statement.operations).toHaveLength(3);
        const first: LlmGenerationRequest = kit.generate.mock.calls[0]?.[0] as LlmGenerationRequest;
        expect(
            JSON.stringify(first.messages.map((message) => (typeof message.content === 'string' ? '' : message.content.map((b) => b.kind))))
        ).toContain('file');
    });

    it('PDF escaneado com mais de 10 páginas é recusado sem chamar o modelo', async () => {
        await expect(kit.reader.read(await scannedPdf(11), true)).rejects.toMatchObject({
            code: 'file.too_many_pages',
            meta: { limit: 10 }
        });
        expect(kit.generate).not.toHaveBeenCalled();
    });

    it('PDF com mais de 50 páginas é recusado sem chamar o modelo', async () => {
        await expect(kit.reader.read(await textPdf([NOTE_TEXT], 51), true)).rejects.toMatchObject({
            code: 'file.too_many_pages',
            meta: { limit: 50 }
        });
        expect(kit.generate).not.toHaveBeenCalled();
    });

    it('teto de custo por arquivo: páginas que sobram ficam sem leitura e viram aviso', async () => {
        kit.generate.mockResolvedValue(response(answer(), 61_000));

        const statement: ParsedInvestmentStatement = await kit.reader.read(await scannedPdf(3), true);

        expect(kit.generate).toHaveBeenCalledTimes(1);
        expect(statement.ignored.map((line) => line.reason)).toEqual(['page_not_read', 'page_not_read']);
        expect(kit.logs['modelRead']).toHaveBeenCalledWith(expect.objectContaining({ pagesNotRead: 2, costMicros: 61_000, calls: 1 }));
    });

    it.each([['não é JSON'], ['{"operations":[]}']])('resposta fora do esquema (%s) vira model.unreadable', async (text: string) => {
        kit.generate.mockResolvedValue(response(text));

        await expect(kit.reader.read(await png(20, 20), true)).rejects.toMatchObject({ code: 'model.unreadable', status: 422 });
    });

    it('resposta que o driver já recusou por não seguir o esquema também é ilegível', async () => {
        kit.generate.mockRejectedValue(new LlmInvalidResponseError('investment_extract'));

        await expect(kit.reader.read(await png(20, 20), true)).rejects.toMatchObject({ code: 'model.unreadable' });
    });

    it('arquivo sem nenhuma operação legível é ilegível', async () => {
        kit.generate.mockResolvedValue(response(answer([])));

        await expect(kit.reader.read(await png(20, 20), true)).rejects.toMatchObject({
            code: 'model.unreadable',
            meta: { reason: 'no_operations' }
        });
        expect(kit.logs['modelFailed']).toHaveBeenCalledWith('no_operations', expect.any(Object));
    });

    it('credencial que sumiu no meio vira model.unavailable', async () => {
        kit.generate.mockRejectedValue(new LlmProviderDisabledError());

        await expect(kit.reader.read(await png(20, 20), true)).rejects.toMatchObject({ code: 'model.unavailable' });
    });

    it('o freio por hora de abuso barra antes do modelo', async () => {
        kit.assertAllowed.mockRejectedValue(new TooManyAttemptsError());

        await expect(kit.reader.read(await png(20, 20), true)).rejects.toMatchObject({ status: 429 });
        expect(kit.generate).not.toHaveBeenCalled();
    });

    it('o log não leva texto do arquivo nem resposta do modelo, só contagens', async () => {
        await kit.reader.read(await textPdf([NOTE_TEXT]), true);

        const logged: string = JSON.stringify(kit.logs['modelRead']?.mock.calls);
        expect(logged).not.toContain('PETR4');
        expect(logged).not.toContain('PETROBRAS');
        expect(kit.logs['modelRead']).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'pdf', calls: 1, operations: 1, documentType: 'note' })
        );
    });
});
