import { describe, expect, it, vi } from 'vitest';
import { PendingActionDomain } from '../domain/pending-action.domain';
import { PendingAction } from '../domain/whatsapp-chat.types';
import { ChatExtensionsRegistry } from './chat-extensions.registry';
import { PendingActionExecutorPort } from './pending-action-executor.port';
import { PendingActionService } from './pending-action.service';
import { WhatsAppChatLogService } from './whatsapp-chat-log.service';

const ACTION: PendingAction = {
    id: 'a1',
    kind: 'calendar_create',
    payload: {},
    linkId: 'l1',
    expiresAt: new Date(Date.now() + 60_000),
    resolvedAt: null,
    resolution: null
} as unknown as PendingAction;

class WithCancelText extends PendingActionExecutorPort {
    public readonly kind: PendingActionExecutorPort['kind'] = 'calendar_create';
    public execute = vi.fn();
    public describe = vi.fn();
    public override canceledText(): string | null {
        return 'Reunião não criada.';
    }
}

class WithoutCancelText extends WithCancelText {
    public override canceledText(): string | null {
        return null;
    }
}

function serviceWith(executor: PendingActionExecutorPort): PendingActionService {
    const actions = {
        latestOpen: vi.fn().mockResolvedValue(ACTION),
        resolve: vi.fn().mockResolvedValue({ ...ACTION, resolution: 'canceled' })
    };
    const registry = { executorFor: vi.fn().mockReturnValue(executor) };
    return new PendingActionService(
        actions as unknown as PendingActionDomain,
        registry as unknown as ChatExtensionsRegistry,
        { actionFailed: vi.fn() } as unknown as WhatsAppChatLogService
    );
}

describe('PendingActionService.tapLatest', () => {
    it('cancelar usa o texto do próprio executor quando ele tem um', async () => {
        expect(await serviceWith(new WithCancelText()).tapLatest('l1', 'no', 'pt-BR')).toBe('Reunião não criada.');
    });

    it('cancelar cai no texto padrão do chat quando o executor não define', async () => {
        const text: string = await serviceWith(new WithoutCancelText()).tapLatest('l1', 'no', 'pt-BR');

        expect(text).not.toBe('Reunião não criada.');
        expect(text.length).toBeGreaterThan(0);
    });
});
