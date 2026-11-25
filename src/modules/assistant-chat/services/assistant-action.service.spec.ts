import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { actionHashOf, stateHashOf } from '../domain/action-hash';
import { ActionExpiredError, ActionNotFoundError, ActionResolvedError } from '../domain/assistant-chat.errors';
import { ACTION_STATUSES, AssistantPendingAction } from '../domain/assistant-chat.types';
import { AssistantPendingActionDomain } from '../domain/assistant-pending-action.domain';
import { AssistantActionExecutorPort } from './assistant-action-executor.port';
import { ConfirmationStaleError } from './assistant-action.errors';
import { AssistantActionRegistry } from './assistant-action.registry';
import { AssistantActionService } from './assistant-action.service';
import { AssistantChatLogService } from './assistant-chat-log.service';

const PAYLOAD: { name: string } = { name: 'Viagem' };

function actionOf(overrides: Partial<AssistantPendingAction> = {}): AssistantPendingAction {
    return {
        id: 'action-1',
        companyId: 'company-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        tool: 'goal_create',
        summary: 'Criar o objetivo Viagem.',
        payload: PAYLOAD,
        actionHash: actionHashOf('goal_create', PAYLOAD),
        stateHash: stateHashOf('state-1'),
        status: ACTION_STATUSES.open,
        resultText: null,
        expiresAt: new Date(Date.now() + 60_000),
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

interface Built {
    readonly service: AssistantActionService;
    readonly claim: ReturnType<typeof vi.fn>;
    readonly close: ReturnType<typeof vi.fn>;
    readonly execute: ReturnType<typeof vi.fn>;
}

function build(action: AssistantPendingAction | null, state: string = 'state-1', claimed: boolean = true): Built {
    const claim: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(claimed ? action : null);
    const close: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(true);
    const execute: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue('Objetivo criado: Viagem.');
    const executor: AssistantActionExecutorPort = {
        tool: 'goal_create',
        stateOf: vi.fn().mockResolvedValue(state),
        execute,
        candidates: vi.fn().mockResolvedValue([])
    };
    const service: AssistantActionService = new AssistantActionService(
        {
            findOfUser: vi.fn().mockResolvedValue(action),
            claim,
            close,
            recordResult: vi.fn().mockResolvedValue(undefined)
        } as unknown as AssistantPendingActionDomain,
        { executorFor: vi.fn().mockReturnValue(executor) } as unknown as AssistantActionRegistry,
        { get: vi.fn().mockReturnValue({ userId: 'user-1' }) } as unknown as AppContext,
        { actionConfirmed: vi.fn(), actionStale: vi.fn() } as unknown as AssistantChatLogService
    );
    return { service, claim, close, execute };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('AssistantActionService', () => {
    it('o sim executa uma vez, com o payload guardado, e devolve o texto do que foi feito', async () => {
        const built: Built = build(actionOf());

        const confirmed = await built.service.confirm('action-1', {});

        expect(built.execute).toHaveBeenCalledTimes(1);
        expect(built.execute).toHaveBeenCalledWith(PAYLOAD, {});
        expect(confirmed).toMatchObject({ status: 'confirmed', resultText: 'Objetivo criado: Viagem.' });
    });

    it('estado mudou: 409 assistant.confirmation_stale, nada executa e a ação fica stale', async () => {
        const built: Built = build(actionOf(), 'state-2');

        await expect(built.service.confirm('action-1', {})).rejects.toBeInstanceOf(ConfirmationStaleError);

        expect(built.execute).not.toHaveBeenCalled();
        expect(built.close).toHaveBeenCalledWith('action-1', ACTION_STATUSES.stale, expect.any(Date));
    });

    it('payload adulterado no banco (hash da ação não bate) não executa', async () => {
        const built: Built = build(actionOf({ actionHash: actionHashOf('goal_create', { name: 'Outro' }) }));

        await expect(built.service.confirm('action-1', {})).rejects.toBeInstanceOf(ConfirmationStaleError);

        expect(built.execute).not.toHaveBeenCalled();
    });

    it('perde a corrida do sim: o claim não devolve linha e a execução não acontece', async () => {
        const built: Built = build(actionOf(), 'state-1', false);

        await expect(built.service.confirm('action-1', {})).rejects.toBeInstanceOf(ActionResolvedError);

        expect(built.execute).not.toHaveBeenCalled();
    });

    it('a execução que vê o estado mudar marca a ação como stale', async () => {
        const built: Built = build(actionOf());
        built.execute.mockRejectedValue(new ConfirmationStaleError());

        await expect(built.service.confirm('action-1', {})).rejects.toBeInstanceOf(ConfirmationStaleError);

        expect(built.close).toHaveBeenCalledWith('action-1', ACTION_STATUSES.stale, expect.any(Date));
    });

    it('ação já resolvida, vencida ou de outra pessoa não confirma', async () => {
        await expect(build(actionOf({ status: ACTION_STATUSES.confirmed })).service.confirm('action-1', {})).rejects.toBeInstanceOf(
            ActionResolvedError
        );
        await expect(build(actionOf({ expiresAt: new Date(Date.now() - 1) })).service.confirm('action-1', {})).rejects.toBeInstanceOf(
            ActionExpiredError
        );
        await expect(build(null).service.confirm('action-1', {})).rejects.toBeInstanceOf(ActionNotFoundError);
    });

    it('cancelar fecha a ação sem executar, e cancelar duas vezes dá 409', async () => {
        const built: Built = build(actionOf());

        expect(await built.service.cancel('action-1')).toMatchObject({ status: 'canceled' });
        expect(built.execute).not.toHaveBeenCalled();
        built.close.mockResolvedValue(false);
        await expect(built.service.cancel('action-1')).rejects.toBeInstanceOf(ActionResolvedError);
    });
});
