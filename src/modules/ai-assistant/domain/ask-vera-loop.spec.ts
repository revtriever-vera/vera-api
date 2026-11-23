import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LlmGenerationRequest, LlmGenerationResponse, LlmToolUse } from '../../../core/llm/llm.types';
import { AiTextRenderer } from './context/ai-text-renderer';
import { guardAnswer } from './ask-answer-guard';
import { AskLoopInput, AskLoopResult, messagesOf, runAskLoop } from './ask-vera-loop';
import { AskVeraTool, AskVeraToolOutput, AskVeraTurn } from './ask-vera.types';

function reply(text: string, toolUses: LlmToolUse[] = []): LlmGenerationResponse {
    return {
        text,
        toolUses,
        stopReason: toolUses.length > 0 ? 'tool_use' : 'end',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
        costMicros: 10,
        callId: 'call'
    };
}

function use(name: string, input: LlmToolUse['input'], id: string = 'u1'): LlmToolUse {
    return { toolUseId: id, name, input };
}

function tool(name: string, kind: AskVeraTool['kind'], output: AskVeraToolOutput, run = vi.fn()): AskVeraTool {
    if (run.getMockImplementation() === undefined) {
        run.mockResolvedValue(output);
    }
    return { name, kind, inputSchema: z.object({ month: z.string().optional() }).strict(), description: (): string => name, run };
}

const SPENDING: AskVeraToolOutput = {
    payload: { total: 'R$ 3.200' },
    numbers: [3200],
    keys: new Map([['cat:eating_out', { kind: 'cat', name: 'Delivery' }]])
};

const GOOD: string = 'Foram **R$ 3.200** em [[cat:eating_out]].';

function build(responses: (LlmGenerationResponse | Error)[], tools: AskVeraTool[], maxSteps: number = 4) {
    const generate = vi.fn((_request: LlmGenerationRequest): Promise<LlmGenerationResponse> => {
        const next: LlmGenerationResponse | Error | undefined = responses.shift();
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next as LlmGenerationResponse);
    });
    const onToolFailure = vi.fn();
    const onCheckFailure = vi.fn();
    const input: AskLoopInput = {
        system: 'system',
        messages: [{ role: 'user', content: 'quanto gastei com delivery?' }],
        tools,
        locale: 'pt-BR',
        messageId: 'm1',
        maxSteps,
        generate,
        check: (text, facts) => guardAnswer({ text, facts, locale: 'pt-BR', renderer: new AiTextRenderer() }),
        onToolFailure,
        onCheckFailure
    };
    return { run: (): Promise<AskLoopResult> => runAskLoop(input), generate, onToolFailure, onCheckFailure };
}

describe('runAskLoop', () => {
    it('pergunta, chama a ferramenta e responde com o texto conferido', async () => {
        const spending: AskVeraTool = tool('spending_by_category', 'read', SPENDING);
        const { run, generate } = build([reply('', [use('spending_by_category', {})]), reply(GOOD)], [spending]);
        const result: AskLoopResult = await run();
        expect(result).toMatchObject({
            ending: 'answered',
            text: 'Foram *R$ 3.200* em delivery.',
            steps: 2,
            toolsUsed: ['spending_by_category']
        });
        expect(generate.mock.calls.map(([request]) => request.referenceId)).toEqual(['ask:m1:1', 'ask:m1:2']);
        expect(generate.mock.calls[0]?.[0]).toMatchObject({ task: 'ask_vera_step', feature: 'whatsapp' });
        expect(result.costMicros).toBe(20);
    });

    it('devolve ao modelo o erro de ferramenta inexistente, sem estourar', async () => {
        const { run, generate, onToolFailure } = build([reply('', [use('nope', {})]), reply('Não consegui conferir isso.')], []);
        const result: AskLoopResult = await run();
        expect(result.ending).toBe('answered');
        expect(onToolFailure).toHaveBeenCalledWith('unknown');
        const second = generate.mock.calls[1]?.[0].messages.at(-1);
        expect(second).toMatchObject({ role: 'user', content: [{ kind: 'tool_result', isError: true }] });
    });

    it('devolve ao modelo a entrada inválida, sem rodar a ferramenta', async () => {
        const run = vi.fn();
        const spending: AskVeraTool = tool('spending_by_category', 'read', SPENDING, run);
        const loop = build([reply('', [use('spending_by_category', { month: 5 })]), reply('Sem dados.')], [spending]);
        await loop.run();
        expect(run).not.toHaveBeenCalled();
        expect(loop.onToolFailure).toHaveBeenCalledWith('spending_by_category');
    });

    it('trata a falha da ferramenta como erro para o modelo', async () => {
        const run = vi.fn().mockRejectedValue(new Error('boom'));
        const spending: AskVeraTool = tool('spending_by_category', 'read', SPENDING, run);
        const loop = build([reply('', [use('spending_by_category', {})]), reply('Não consegui conferir isso.')], [spending]);
        expect((await loop.run()).ending).toBe('answered');
        expect(loop.onToolFailure).toHaveBeenCalledWith('spending_by_category');
    });

    it('recusa saída de ferramenta acima de 8 KB', async () => {
        const big: AskVeraToolOutput = { payload: { text: 'x'.repeat(9000) }, numbers: [] };
        const loop = build([reply('', [use('big', {})]), reply('Não consegui conferir isso.')], [tool('big', 'read', big)]);
        await loop.run();
        const message = loop.generate.mock.calls[1]?.[0].messages.at(-1);
        expect(message).toMatchObject({ content: [{ kind: 'tool_result', isError: true }] });
    });

    it('para no quarto passo com truncated', async () => {
        const spending: AskVeraTool = tool('spending_by_category', 'read', SPENDING);
        const steps = [1, 2, 3, 4].map((n: number) => reply('', [use('spending_by_category', {}, `u${String(n)}`)]));
        const result: AskLoopResult = await build(steps, [spending]).run();
        expect(result).toMatchObject({ ending: 'truncated', steps: 4 });
    });

    it('pede nova tentativa quando a resposta tem quatro frases', async () => {
        const spending: AskVeraTool = tool('spending_by_category', 'read', SPENDING);
        const long: string = 'Foram R$ 3.200. Foi em delivery. Subiu um pouco. Veja de novo.';
        const loop = build([reply('', [use('spending_by_category', {})]), reply(long), reply(GOOD)], [spending]);
        const result: AskLoopResult = await loop.run();
        expect(result).toMatchObject({ ending: 'answered', steps: 3 });
        expect(loop.onCheckFailure).toHaveBeenCalledWith('sentences');
    });

    it('com número inventado duas vezes termina em check_failed', async () => {
        const spending: AskVeraTool = tool('spending_by_category', 'read', SPENDING);
        const wrong: string = 'Foram R$ 9.999 em delivery.';
        const result: AskLoopResult = await build(
            [reply('', [use('spending_by_category', {})]), reply(wrong), reply(wrong)],
            [spending]
        ).run();
        expect(result).toMatchObject({ ending: 'check_failed', steps: 3 });
    });

    it('ferramenta de proposta registra a proposta e não vai ao texto', async () => {
        const proposal: AskVeraToolOutput = {
            payload: {},
            proposal: { summary: 'Reunião sexta 15h', payload: { at: '2026-11-27T15:00' } }
        };
        const loop = build(
            [reply('', [use('calendar_create_event', {})]), reply('Posso marcar a reunião para sexta?')],
            [tool('calendar_create_event', 'proposal', proposal)]
        );
        const result: AskLoopResult = await loop.run();
        expect(result.proposals).toEqual([
            { tool: 'calendar_create_event', summary: 'Reunião sexta 15h', payload: { at: '2026-11-27T15:00' } }
        ]);
        expect(result).toMatchObject({ ending: 'answered', text: '' });
    });

    it('proposta com texto do modelo que cita horário do pedido não cai na checagem de números', async () => {
        const proposal: AskVeraToolOutput = { payload: {}, proposal: { summary: 'Reunião sexta 15h', payload: {} } };
        const loop = build(
            [reply('', [use('calendar_create_event', {})]), reply('Criar a reunião sexta, 27/11, às 15:00?')],
            [tool('calendar_create_event', 'proposal', proposal)]
        );
        expect(await loop.run()).toMatchObject({ ending: 'answered', text: '', steps: 2 });
    });

    it('texto que diz "Lembrete criado" ou pede "Confirma?" sem chamar a ferramenta volta ao modelo para chamá-la', async () => {
        const proposal: AskVeraToolOutput = { payload: {}, proposal: { summary: 'Lembrete dia 5', payload: {} } };
        const loop = build(
            [
                reply('Vou criar um lembrete para aportar todo dia 5. Confirma?'),
                reply('', [use('reminder_create', {})]),
                reply('Aguardando a sua confirmação.')
            ],
            [tool('reminder_create', 'proposal', proposal)]
        );
        const result: AskLoopResult = await loop.run();
        expect(result).toMatchObject({ ending: 'answered', steps: 3 });
        expect(result.proposals).toHaveLength(1);
    });

    it('afirmar a criação sem ferramenta duas vezes termina em check_failed, nunca em "Lembrete criado"', async () => {
        const claim: string = 'Lembrete criado. A Vera vai te avisar.';
        const proposal: AskVeraToolOutput = { payload: {}, proposal: { summary: 'x', payload: {} } };
        const result: AskLoopResult = await build([reply(claim), reply(claim)], [tool('reminder_create', 'proposal', proposal)]).run();
        expect(result).toMatchObject({ ending: 'check_failed', text: '' });
    });

    it('ferramenta direta devolve o texto formatado sem voltar ao modelo', async () => {
        const direct: AskVeraToolOutput = { payload: {}, text: 'Sexta 15h: Reunião com o time' };
        const loop = build([reply('', [use('calendar_list_events', {})])], [tool('calendar_list_events', 'direct', direct)]);
        const result: AskLoopResult = await loop.run();
        expect(result).toMatchObject({ ending: 'direct', text: 'Sexta 15h: Reunião com o time', steps: 1 });
        expect(loop.generate).toHaveBeenCalledTimes(1);
    });

    it('um número só de uma ferramenta sem `numbers` vem do próprio payload', async () => {
        const plain: AskVeraToolOutput = { payload: { total: 'R$ 3.200' } };
        const loop = build([reply('', [use('t', {})]), reply('Foram R$ 3.200 no mês.')], [tool('t', 'read', plain)]);
        expect((await loop.run()).ending).toBe('answered');
    });

    it('marcador ambíguo entre duas ferramentas é descartado', async () => {
        const first: AskToolHolder = holder('a', 'Mercado');
        const second: AskToolHolder = holder('b', 'Lazer');
        const loop = build(
            [reply('', [use('a', {}, '1'), use('b', {}, '2')]), reply('Foram R$ 10 em [[cat:custom_1]].'), reply('Foram R$ 10.')],
            [first.tool, second.tool]
        );
        const result: AskLoopResult = await loop.run();
        expect(loop.onCheckFailure).toHaveBeenCalledWith('marker');
        expect(result.ending).toBe('answered');
    });
});

interface AskToolHolder {
    readonly tool: AskVeraTool;
}

function holder(name: string, label: string): AskToolHolder {
    const output: AskVeraToolOutput = {
        payload: { x: 'R$ 10' },
        numbers: [10],
        keys: new Map([['cat:custom_1', { kind: 'cat', name: label }]])
    };
    return { tool: tool(name, 'read', output) };
}

describe('messagesOf', () => {
    it('limita a seis turnos, junta papéis seguidos e começa pela pessoa', () => {
        const history = [
            { role: 'vera', text: 'Oi' },
            { role: 'person', text: 'a' },
            { role: 'person', text: 'b' },
            { role: 'vera', text: 'c' }
        ] as const;
        expect(messagesOf(history, 'd')).toEqual([
            { role: 'user', content: 'a\nb' },
            { role: 'assistant', content: 'c' },
            { role: 'user', content: 'd' }
        ]);
    });

    it('guarda só as seis últimas', () => {
        const history: AskVeraTurn[] = Array.from({ length: 10 }, (_unused: unknown, index: number): AskVeraTurn => ({
            role: index % 2 === 0 ? 'person' : 'vera',
            text: String(index)
        }));
        expect(messagesOf(history, 'q').map((message) => message.content as string)).toEqual(['4', '5', '6', '7', '8', '9', 'q']);
    });
});
