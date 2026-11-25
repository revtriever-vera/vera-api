import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LlmGenerationResponse } from '../../../core/llm/llm.types';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { AiTextRenderer } from '../domain/context/ai-text-renderer';
import { AskVeraToolPort } from './ask-vera-tool.port';
import { AskVeraTurn } from '../domain/ask-vera.types';
import { AskVeraService } from './ask-vera.service';

const USAGE = { state: 'ok', usedBps: 100, resetsAt: '2026-12-01T00:00:00Z' };

function reply(text: string, toolUses: LlmGenerationResponse['toolUses'] = []): LlmGenerationResponse {
    return {
        text,
        toolUses,
        stopReason: 'end',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
        costMicros: 5,
        callId: 'c'
    };
}

function build(responses: (LlmGenerationResponse | Error)[], tools: AskVeraToolPort[] = []) {
    const generate = vi.fn(() => {
        const next: LlmGenerationResponse | Error | undefined = responses.shift();
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next as LlmGenerationResponse);
    });
    const access = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
    const telemetry = { finished: vi.fn(), capReached: vi.fn(), toolFailed: vi.fn(), checkFailed: vi.fn() };
    const context = { get: () => ({ requestId: 'r', locale: 'pt-BR' }), run: (_data: unknown, fn: () => unknown) => fn() };
    const service: AskVeraService = new AskVeraService(
        { generate },
        { available: () => Promise.resolve(tools) } as never,
        access as never,
        { state: () => Promise.resolve(USAGE) } as never,
        { todayInCompany: () => Promise.resolve('2026-11-23') } as never,
        new AiTextRenderer(),
        context as never,
        telemetry as never
    );
    return { service, generate, access, telemetry };
}

function ask(service: AskVeraService, text: string, history: AskVeraTurn[] = []) {
    return service.ask({
        text,
        history,
        locale: 'pt-BR',
        messageId: 'm1',
        channel: 'whatsapp',
        feature: 'whatsapp',
        allowedTools: new Set()
    });
}

function askApp(service: AskVeraService, text: string, feature: 'ai' | 'help' = 'ai') {
    return service.ask({
        text,
        history: [],
        locale: 'pt-BR',
        messageId: 'm2',
        channel: 'app',
        feature,
        screen: { path: '/portfolio/goals' },
        allowedTools: new Set()
    });
}

function sentRequest(generate: { mock: { calls: unknown[][] } }): {
    task: string;
    feature: string;
    system: string;
    messages: { content: unknown }[];
} {
    return generate.mock.calls[0]?.[0] as never;
}

describe('AskVeraService', () => {
    it('recusa Pix sem modelo, sem permissão e sem cota', async () => {
        const { service, generate, access, telemetry } = build([]);
        const answer = await ask(service, 'faz um Pix de R$ 50 pra Maria');
        expect(answer).toMatchObject({
            text: 'A Vera não faz Pix, pagamentos nem transferências: ela só lê seus dados. Use o app do seu banco.',
            source: 'fixed',
            truncated: false
        });
        expect(generate).not.toHaveBeenCalled();
        expect(access.assertAllowed).not.toHaveBeenCalled();
        expect(telemetry.finished).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'fixed_refusal' }));
    });

    it('responde a saudação com o texto fixo', async () => {
        const { service, telemetry } = build([]);
        expect((await ask(service, 'oi')).text).toContain('Pergunte sobre a carteira');
        expect(telemetry.finished).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'fixed_greeting' }));
    });

    it('no app a saudação não promete agenda, lembrete nem dados no modo ajuda', async () => {
        const { service } = build([]);
        const text: string = (await askApp(service, 'oi', 'help')).text;
        expect(text).toContain('como usar a Vera');
        expect(text).not.toMatch(/reunião|lembrete|carteira|gastos/u);
    });

    it('confere a feature e a permissão antes do modelo', async () => {
        const { service, access, generate } = build([reply('Não tenho dados para isso.')]);
        await ask(service, 'quanto gastei?');
        expect(access.assertAllowed).toHaveBeenCalled();
        expect(generate).toHaveBeenCalledTimes(1);
    });

    it('termina com o aviso quando usou a carteira, fora do texto do modelo', async () => {
        const portfolio = {
            name: 'portfolio_overview',
            feature: 'whatsapp',
            kind: 'read',
            inputSchema: z.object({}),
            description: () => 'x',
            run: () => Promise.resolve({ payload: { total: 'R$ 3.200' }, numbers: [3200] })
        } as unknown as AskVeraToolPort;
        const { service } = build(
            [reply('', [{ toolUseId: 'u', name: 'portfolio_overview', input: {} }]), reply('A carteira tem **R$ 3.200**.')],
            [portfolio]
        );
        const answer = await ask(service, 'como está minha carteira?');
        expect(answer.text).toBe('A carteira tem *R$ 3.200*.\nIsto não é uma recomendação de compra ou venda.');
        expect(answer.toolsUsed).toEqual(['portfolio_overview']);
        expect(answer.notice).toBe(true);
        expect(answer.sent).toEqual([{ tool: 'portfolio_overview', payload: { total: 'R$ 3.200' } }]);
    });

    it('acrescenta o aviso quando a pergunta cita um ativo e quando a resposta cita um ativo', async () => {
        const byQuestion = build([reply('PETR4 é uma ação de petróleo.')]);
        expect((await ask(byQuestion.service, 'o que é PETR4?')).text).toBe(
            'PETR4 é uma ação de petróleo.\nIsto não é uma recomendação de compra ou venda.'
        );
        const byAnswer = build([reply('Ações são partes de uma empresa.')]);
        expect((await ask(byAnswer.service, 'o que é bolsa?')).notice).toBe(true);
    });

    it('não repete o aviso que o modelo escreveu e não aceita ticker que ninguém citou', async () => {
        const echoed = build([reply('Um CDB é renda fixa. Isto não é uma recomendação de compra ou venda.')]);
        expect((await ask(echoed.service, 'o que é um CDB?')).text.match(/Isto não é/g)).toHaveLength(1);
        const invented = build([reply('Olhe VALE3.'), reply('Olhe VALE3.')]);
        expect((await ask(invented.service, 'o que é um CDB?')).source).toBe('fixed');
    });

    it('troca a recusa por resposta com aviso e reprova o conselho', async () => {
        const explained = build([reply('PETR4 é uma ação de petróleo.')]);
        expect((await ask(explained.service, 'devo vender PETR4?')).notice).toBe(true);
        const advice = build([reply('Venda suas ações de PETR4.'), reply('Venda suas ações de PETR4.')]);
        expect((await ask(advice.service, 'devo vender PETR4?')).source).toBe('fixed');
    });

    it('tira dado pessoal da pergunta e do histórico antes de montar a requisição', async () => {
        const { service, generate } = build([reply('Sem dados.')]);
        const history: AskVeraTurn[] = [
            { role: 'person', text: 'meu e-mail é ana@example.com e a chave 123e4567-e89b-42d3-a456-426614174000' }
        ];
        await ask(service, 'meu CPF é 529.982.247-25, cartão 4111 1111 1111 1111. Quanto gastei?', history);
        const json: string = JSON.stringify(sentRequest(generate).messages);
        expect(json).not.toMatch(/529\.982|4111|ana@example|123e4567/);
        expect(json).toContain('[dado removido]');
    });

    it('no app usa a tarefa do app, a feature pedida e o prompt do app com a tela', async () => {
        const { service, generate, access } = build([reply('Veja a meta.')]);
        await askApp(service, 'como crio uma meta?', 'help');
        expect(access.assertAllowed).toHaveBeenCalledWith(expect.objectContaining({ channel: 'app', feature: 'help' }));
        const request = sentRequest(generate);
        expect(request).toMatchObject({ task: 'ask_vera_app_step', feature: 'help' });
        expect(request.system).toContain('dentro do app');
        expect(request.system).toContain('A pessoa está em Objetivos');
    });

    it('não põe o aviso em resposta sobre gastos', async () => {
        const { service } = build([reply('Você não tem gastos no mês.')]);
        expect((await ask(service, 'quanto gastei?')).text).toBe('Você não tem gastos no mês.');
    });

    it('devolve a resposta fixa de falha quando a checagem reprova duas vezes', async () => {
        const { service, telemetry } = build([reply('Foram R$ 9.999.'), reply('Foram R$ 9.999.')]);
        const answer = await ask(service, 'quanto gastei?');
        expect(answer).toMatchObject({
            text: 'Não consegui responder isso agora. Tente perguntar de outro jeito.',
            source: 'fixed',
            truncated: false
        });
        expect(telemetry.finished).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'fallback' }));
    });

    it('sobe a cota estourada sem resposta parcial', async () => {
        const { service, telemetry } = build([new CapReachedError('whatsapp', null)]);
        await expect(ask(service, 'quanto gastei?')).rejects.toBeInstanceOf(CapReachedError);
        expect(telemetry.capReached).toHaveBeenCalled();
    });

    it('corta a pergunta em 1000 caracteres', async () => {
        const { service, generate } = build([reply('Sem dados.')]);
        await ask(service, `quanto gastei ${'a'.repeat(2000)}`);
        const request = generate.mock.calls[0] as unknown as [{ messages: { content: string }[] }];
        expect(request[0].messages[0]?.content.length).toBe(1000);
    });
});
