import { describe, expect, it, vi } from 'vitest';
import { LlmInvalidResponseError } from '../../../core/llm/llm.errors';
import { LlmGenerationRequest, LlmGenerationResponse } from '../../../core/llm/llm.types';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { AiContext, BuiltContext } from '../domain/context/ai-context.types';
import { AiTextRenderer } from '../domain/context/ai-text-renderer';
import { AiAssistantLogService } from './ai-assistant-log.service';
import { AiAssistantMetricsService } from './ai-assistant-metrics.service';
import { SummaryGeneratorService } from './summary-generator.service';

const BUILT: BuiltContext<AiContext> = {
    payload: { mes: '2026-09', renda: 'R$ 28.000' } as unknown as AiContext,
    numbers: [28000],
    keys: new Map([['cat:delivery', { kind: 'cat', name: 'Delivery' }]])
};

function answer(text: string): LlmGenerationResponse {
    return {
        text,
        toolUses: [],
        stopReason: 'end',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
        costMicros: 10,
        callId: 'call-1'
    };
}

function build(responses: (LlmGenerationResponse | Error)[]) {
    const generate = vi.fn((_request: LlmGenerationRequest): Promise<LlmGenerationResponse> => {
        const next: LlmGenerationResponse | Error | undefined = responses.shift();
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next as LlmGenerationResponse);
    });
    const logs = { summaryGenerated: vi.fn(), summaryGuardFailed: vi.fn() };
    const metrics = { summary: vi.fn(), summaryGuardFailure: vi.fn() };
    const service: SummaryGeneratorService = new SummaryGeneratorService(
        { generate },
        new AiTextRenderer(),
        logs as unknown as AiAssistantLogService,
        metrics as unknown as AiAssistantMetricsService
    );
    return { service, generate, logs, metrics };
}

const REQUEST = { kind: 'month', periodKey: '2026-09', built: BUILT, locale: 'pt-BR' } as const;
const GOOD: string = JSON.stringify({ paragraphs: ['Entraram **R$ 28.000**, com [[cat:delivery]] em alta.'] });

describe('SummaryGeneratorService', () => {
    it('manda o contexto serializado como único conteúdo, com o esquema e a referência da cota', async () => {
        const { service, generate } = build([answer(GOOD)]);

        const result = await service.generate(REQUEST);

        const sent: LlmGenerationRequest = generate.mock.calls[0]?.[0] as LlmGenerationRequest;
        expect(sent).toMatchObject({ task: 'summary_month', feature: 'ai', referenceId: 'summary:month:2026-09:1' });
        expect(sent.messages).toEqual([{ role: 'user', content: JSON.stringify(BUILT.payload) }]);
        expect(sent.responseSchema).toMatchObject({ type: 'object', required: ['paragraphs'] });
        expect(result).toEqual({ paragraphs: ['Entraram **R$ 28.000**, com Delivery em alta.'], callId: 'call-1', promptVersion: 3 });
    });

    it('reprovou na primeira: descreve a falha ao modelo e grava a segunda', async () => {
        const invented: string = JSON.stringify({ paragraphs: ['Entraram R$ 99.999.'] });
        const { service, generate, metrics, logs } = build([answer(invented), answer(GOOD)]);

        await service.generate(REQUEST);

        const second: LlmGenerationRequest = generate.mock.calls[1]?.[0] as LlmGenerationRequest;
        expect(second.messages).toHaveLength(3);
        expect(second.messages[1]).toEqual({ role: 'assistant', content: invented });
        expect(JSON.stringify(second.messages[2])).toContain('number');
        expect(second.referenceId).toBe('summary:month:2026-09:2');
        expect(metrics.summaryGuardFailure).toHaveBeenCalledWith('month', 'number');
        expect(logs.summaryGuardFailed).toHaveBeenCalledWith('month', 'number', 1);
        expect(metrics.summary).toHaveBeenCalledWith('month', 'generated');
    });

    it('duas reprovações: ai.invalid_response e métrica invalid', async () => {
        const bad: string = JSON.stringify({ paragraphs: ['Compre PETR4!'] });
        const { service, metrics } = build([answer(bad), answer('não é json')]);

        await expect(service.generate(REQUEST)).rejects.toBeInstanceOf(LlmInvalidResponseError);
        expect(metrics.summary).toHaveBeenCalledWith('month', 'invalid');
    });

    it('resposta ilegível do driver conta como tentativa; segunda ilegível também falha', async () => {
        const first = build([new LlmInvalidResponseError('summary_month'), answer(GOOD)]);
        const second = build([new LlmInvalidResponseError('summary_month'), new LlmInvalidResponseError('summary_month')]);

        await expect(first.service.generate(REQUEST)).resolves.toMatchObject({ callId: 'call-1' });
        await expect(second.service.generate(REQUEST)).rejects.toBeInstanceOf(LlmInvalidResponseError);
    });

    it('cota e provedor indisponível passam direto, sem nova tentativa', async () => {
        const { service, generate } = build([new CapReachedError('ai', '2026-12-01T00:00:00.000Z', 'premium')]);

        await expect(service.generate(REQUEST)).rejects.toBeInstanceOf(CapReachedError);
        expect(generate).toHaveBeenCalledTimes(1);
    });
});
