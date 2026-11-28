import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { LlmInvalidResponseError, LlmProviderDisabledError } from '../../../core/llm/llm.errors';
import { LlmContentBlock, LlmGenerationRequest, LlmGenerationResponse } from '../../../core/llm/llm.types';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { ModelDocumentService } from '../../investment-import/services/model-document.service';
import { ModelConfirmationRequiredError, ModelUnavailableError } from '../domain/statement-import.errors';
import { StatementImportLogService } from './statement-import-log.service';
import { StatementModelReaderService } from './statement-model-reader.service';

const HOLDER: string = 'PESSOA SENTINELA EXEMPLO';
const DOCUMENT: string = '111.222.333-96';
const MERCHANT: string = 'PADARIA SENTINELA';

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

function answer(): string {
    return JSON.stringify({
        currency: 'BRL',
        institution: 'Banco Exemplo',
        accountLast4: null,
        transactions: [{ date: '2026-10-03', description: MERCHANT, amountMinor: -1290 }]
    });
}

async function textPdf(): Promise<Uint8Array> {
    const document: PDFDocument = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage([595, 842]);
    const lines: string[] = [
        'BANCO EXEMPLO - EXTRATO DE CONTA CORRENTE',
        `Cliente: ${HOLDER}`,
        `CPF: ${DOCUMENT}`,
        'Agencia: 1234 Conta: 56789-0',
        `03/10/2026 ${MERCHANT} -12,90`,
        '05/10/2026 PIX RECEBIDO FULANO EXEMPLO 150,00'
    ];
    lines.forEach((line: string, row: number): void => {
        page.drawText(line, { x: 20, y: 800 - row * 14, size: 10, font });
    });
    return document.save();
}

function build() {
    const generate = vi.fn();
    const enabled = vi.fn().mockResolvedValue(true);
    const assertAllowed = vi.fn().mockResolvedValue(undefined);
    const logs = { modelRead: vi.fn(), modelFailed: vi.fn() };
    const reader = new StatementModelReaderService(
        new ModelDocumentService(),
        { generate },
        { enabled } as unknown as LlmAvailabilityService,
        { assertAllowed } as unknown as ThrottleService,
        { get: () => ({ requestId: 'r', companyId: 'co-1' }) } as unknown as AppContext,
        logs as unknown as StatementImportLogService
    );
    return { reader, generate, enabled, assertAllowed, logs };
}

describe('StatementModelReaderService', () => {
    let built: ReturnType<typeof build>;

    beforeEach(() => {
        built = build();
    });

    it('aceita PDF e imagem pelos bytes, não texto', () => {
        expect(built.reader.accepts(Buffer.from('%PDF-1.4 x'))).toBe(true);
        expect(built.reader.accepts(Buffer.from('OFXHEADER:100'))).toBe(false);
    });

    it('sem modelo configurado é 503; sem consentimento é 428 e nada vai ao modelo', async () => {
        built.enabled.mockResolvedValueOnce(false);

        await expect(built.reader.assertConsented(true)).rejects.toBeInstanceOf(ModelUnavailableError);
        await expect(built.reader.assertConsented(false)).rejects.toBeInstanceOf(ModelConfirmationRequiredError);
        expect(built.generate).not.toHaveBeenCalled();
    });

    it('PDF com texto vai mascarado (titular, CPF, conta), com a descrição da transação, pela tarefa de extrato na cota de IA', async () => {
        built.generate.mockResolvedValue(response(answer(), 4200));

        const reading = await built.reader.read(await textPdf());

        const request = built.generate.mock.calls[0]?.[0] as LlmGenerationRequest;
        const sent: string = JSON.stringify(request.messages);
        expect(request.task).toBe('statement_extract');
        expect(request.feature).toBe('ai');
        expect(sent).toContain(MERCHANT);
        for (const secret of [HOLDER, DOCUMENT, '56789-0']) {
            expect(sent).not.toContain(secret);
        }
        expect(built.assertAllowed).toHaveBeenCalledWith('statement-import-model:co-1', 30, 3600);
        expect(reading.rows).toHaveLength(1);
        expect(built.logs.modelRead).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'pdf', textLayer: true, costMicros: 4200, rows: 1 })
        );
        expect(JSON.stringify(built.logs.modelRead.mock.calls)).not.toContain(MERCHANT);
    });

    it('imagem vai como imagem', async () => {
        built.generate.mockResolvedValue(response(answer()));
        const sharp = (await import('sharp')).default;
        const png: Buffer = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#fff' } })
            .png()
            .toBuffer();

        await built.reader.read(png);

        const content = (built.generate.mock.calls[0]?.[0] as LlmGenerationRequest).messages[0]?.content as LlmContentBlock[];
        expect(content.map((block: LlmContentBlock) => block.kind)).toEqual(['text', 'image']);
    });

    it('resposta vazia ou fora do esquema é model_unreadable, registrada sem dados da pessoa', async () => {
        built.generate.mockResolvedValue(response(JSON.stringify({ currency: 'BRL', transactions: [] })));

        await expect(built.reader.read(await textPdf())).rejects.toMatchObject({
            code: 'imports.model_unreadable',
            meta: { reason: 'no_transactions' }
        });
        expect(built.logs.modelFailed).toHaveBeenCalledWith('no_transactions', expect.objectContaining({ kind: 'pdf' }));
    });

    it('erros do modelo viram os códigos do extrato', async () => {
        built.generate.mockRejectedValueOnce(new LlmInvalidResponseError('statement_extract'));
        await expect(built.reader.read(await textPdf())).rejects.toMatchObject({ meta: { reason: 'invalid_response' } });

        built.generate.mockRejectedValueOnce(new LlmProviderDisabledError());
        await expect(built.reader.read(await textPdf())).rejects.toBeInstanceOf(ModelUnavailableError);

        built.generate.mockRejectedValueOnce(new RangeError('x'));
        await expect(built.reader.read(await textPdf())).rejects.toBeInstanceOf(RangeError);
    });
});
