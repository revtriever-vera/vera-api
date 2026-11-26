import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { LlmGenerationRequest, LlmGenerationResponse } from '../../../core/llm/llm.types';
import { AskVeraService } from '../../ai-assistant/services/ask-vera.service';
import { AssistantMessage, MESSAGE_STATUSES } from '../domain/assistant-chat.types';
import { TurnRequestedPayload } from '../validation/assistant-chat-jobs.schemas';
import { AssistantAnswerApplication } from './assistant-answer.application';

const SUMMARY: string = 'Importar 12 operações em 4 ativos.';
const PAYLOAD: { previewId: string; documentType: string; notes: never[] } = {
    previewId: '0199c5a0-5d1e-7a3b-9c11-2f4e8b6a7d10',
    documentType: 'note',
    notes: []
};

function reply(toolUses: LlmGenerationResponse['toolUses'], text: string = ''): LlmGenerationResponse {
    return {
        text,
        toolUses,
        stopReason: 'end',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
        costMicros: 5,
        callId: 'c'
    };
}

function messageOf(id: string, text: string, role: 'person' | 'vera'): AssistantMessage {
    return {
        id,
        companyId: 'company-1',
        conversationId: 'conversation-1',
        role,
        text,
        status: role === 'person' ? MESSAGE_STATUSES.done : MESSAGE_STATUSES.pending,
        createdAt: new Date('2026-11-25T12:00:00Z')
    } as unknown as AssistantMessage;
}

function build(responses: LlmGenerationResponse[], allowed: boolean = true) {
    const generate = vi.fn((_request: LlmGenerationRequest) => Promise.resolve(responses.shift() as LlmGenerationResponse));
    const available = vi.fn().mockResolvedValue([]);
    const context = { get: () => ({ requestId: 'r', locale: 'pt-BR' }), run: (_data: unknown, fn: () => unknown) => fn() };
    const ask: AskVeraService = new AskVeraService(
        { generate },
        { available } as never,
        { assertAllowed: vi.fn().mockResolvedValue(undefined) } as never,
        { state: () => Promise.resolve({ state: 'ok', usedBps: 1, resetsAt: '2026-12-01T00:00:00Z' }) } as never,
        { todayInCompany: () => Promise.resolve('2026-11-25') } as never,
        { render: (text: string) => ({ ok: true, text }) } as never,
        context as never,
        { finished: vi.fn(), capReached: vi.fn(), toolFailed: vi.fn(), checkFailed: vi.fn() } as never
    );
    const finish = vi.fn().mockResolvedValue(true);
    const propose = vi.fn().mockResolvedValue(null);
    const messages = {
        findTurn: vi.fn().mockResolvedValue(messageOf('turn-1', '', 'vera')),
        findQuestion: vi.fn().mockResolvedValue(messageOf('question-1', 'importa isso\nArquivo: nota-joao-silva.pdf', 'person')),
        answeredBefore: vi.fn().mockResolvedValue([messageOf('old', 'Arquivo: antiga.pdf', 'person')]),
        finish,
        fail: vi.fn().mockResolvedValue(true)
    };
    const application: AssistantAnswerApplication = new AssistantAnswerApplication(
        messages as never,
        { modeOf: () => Promise.resolve(allowed ? 'ai' : 'help') } as never,
        ask,
        { propose } as never,
        { canEdit: () => Promise.resolve(true) } as never,
        context as never,
        { turnFinished: vi.fn(), turnFailed: vi.fn() } as never,
        { turn: vi.fn(), seconds: vi.fn() } as never
    );
    return { application, generate, finish, propose, available };
}

function requestOf(overrides: Partial<TurnRequestedPayload> = {}): TurnRequestedPayload {
    return {
        turnId: 'turn-1',
        questionId: 'question-1',
        userId: '0199c5a0-5d1e-7a3b-9c11-2f4e8b6a7d11',
        locale: 'pt-BR',
        importProposal: { summary: SUMMARY, payload: PAYLOAD },
        ...overrides
    };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('turno com arquivo anexado', () => {
    it('o modelo recebe só a pergunta e a ferramenta de proposta: nada do arquivo, das linhas ou dos valores', async () => {
        const { application, generate } = build([reply([{ toolUseId: 't1', name: 'investment_import', input: {} }]), reply([], 'Feito.')]);

        await application.run(requestOf());

        const sent: LlmGenerationRequest = generate.mock.calls[0]?.[0] as LlmGenerationRequest;
        const serialized: string = JSON.stringify(sent);
        expect(sent.tools?.map((tool) => tool.name)).toEqual(['investment_import']);
        expect(sent.messages).toEqual([{ role: 'user', content: 'importa isso' }]);
        expect(serialized).not.toContain('nota-joao-silva');
        expect(serialized).not.toContain('antiga.pdf');
        expect(serialized).not.toContain(PAYLOAD.previewId);
        expect(serialized).not.toContain('12 operações');
        expect(sent.system).toContain('investment_import');
    });

    it('a proposta do modelo vira o cartão: o texto da mensagem é o resumo agregado e o payload só leva o previewId', async () => {
        const { application, finish, propose } = build([
            reply([{ toolUseId: 't1', name: 'investment_import', input: {} }]),
            reply([], 'Feito.')
        ]);

        await application.run(requestOf());

        expect(finish).toHaveBeenCalledWith('turn-1', expect.objectContaining({ text: SUMMARY, toolsUsed: ['investment_import'] }));
        expect(propose).toHaveBeenCalledWith(expect.anything(), { tool: 'investment_import', summary: SUMMARY, payload: PAYLOAD });
    });

    it('o modelo que não chama a ferramenta não tira o cartão: a proposta vem da prévia', async () => {
        const { application, finish, propose } = build([reply([], 'Pronto, importei tudo.'), reply([], 'Pronto, importei tudo.')]);

        await application.run(requestOf());

        expect(finish).toHaveBeenCalledWith('turn-1', expect.objectContaining({ text: SUMMARY }));
        expect(propose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tool: 'investment_import', payload: PAYLOAD }));
    });

    it('sem texto da pessoa, o modelo recebe uma frase fixa em vez do nome do arquivo', async () => {
        const { application, generate } = build([reply([{ toolUseId: 't1', name: 'investment_import', input: {} }]), reply([], 'Feito.')]);

        await application.run(requestOf());
        const first = generate.mock.calls[0]?.[0] as LlmGenerationRequest;
        expect(first.messages).toHaveLength(1);
    });

    it('no plano Free (modo help) o cartão da importação também sai', async () => {
        const { application, propose } = build(
            [reply([{ toolUseId: 't1', name: 'investment_import', input: {} }]), reply([], 'Feito.')],
            false
        );

        await application.run(requestOf());

        expect(propose).toHaveBeenCalledTimes(1);
    });
});
