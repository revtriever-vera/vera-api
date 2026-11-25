import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { AssistantConversationDomain } from '../domain/assistant-conversation.domain';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';
import { AssistantActionService } from '../services/assistant-action.service';
import { AssistantAccessService } from '../services/assistant-access.service';
import { AssistantChatLogService } from '../services/assistant-chat-log.service';
import { AssistantTurnExpiry } from '../services/assistant-turn.expiry';
import { AssistantConversationApplication } from './assistant-conversation.application';

function build(enabled: boolean): AssistantConversationApplication {
    return new AssistantConversationApplication(
        { latestOfUser: vi.fn().mockResolvedValue(null) } as unknown as AssistantConversationDomain,
        {} as unknown as AssistantMessageDomain,
        {} as unknown as AssistantActionService,
        { modeOf: vi.fn().mockResolvedValue('free'), usageOf: vi.fn().mockResolvedValue(null) } as unknown as AssistantAccessService,
        {} as unknown as AssistantTurnExpiry,
        { get: vi.fn().mockReturnValue({ userId: 'user-1' }) } as unknown as AppContext,
        {} as unknown as AssistantChatLogService,
        { enabled: vi.fn().mockResolvedValue(enabled) } as unknown as LlmAvailabilityService
    );
}

describe('AssistantConversationApplication.current', () => {
    it('reports the model as on when the key is there', async () => {
        expect((await build(true).current()).enabled).toBe(true);
    });

    it('reports the model as off when there is no key', async () => {
        expect(await build(false).current()).toMatchObject({ conversationId: null, messages: [], enabled: false });
    });
});
