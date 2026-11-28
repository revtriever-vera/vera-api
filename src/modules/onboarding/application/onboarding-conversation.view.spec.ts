import { describe, expect, it } from 'vitest';
import { OnboardingConversationView } from '../validation/onboarding-conversation.schemas';
import { conversationViewOf } from './onboarding-conversation.view';

const AT: Date = new Date('2026-11-28T12:00:00.000Z');

describe('conversationViewOf', () => {
    it('só a última mensagem com botões fica aberta, e a pergunta livre vem sem payload', () => {
        const view: OnboardingConversationView = conversationViewOf({
            conversationId: '01970000-0000-7000-8000-000000000001',
            script: { status: 'active', step: 'modules', remainingSteps: 1, pending: [] },
            modules: { portfolio: true, spending: true },
            messages: [
                {
                    id: '01970000-0000-7000-8000-000000000002',
                    role: 'vera',
                    text: 'Oi!',
                    payload: {
                        chips: [
                            { id: 'modules.both', label: 'Os dois', action: { type: 'CHOOSE_MODULES', portfolio: true, spending: true } }
                        ]
                    },
                    createdAt: AT
                },
                { id: '01970000-0000-7000-8000-000000000003', role: 'person', text: 'pergunta livre', payload: null, createdAt: AT },
                { id: '01970000-0000-7000-8000-000000000004', role: 'system', text: 'nota', payload: {}, createdAt: AT },
                {
                    id: '01970000-0000-7000-8000-000000000005',
                    role: 'vera',
                    text: 'Pronto',
                    payload: { card: { type: 'summary' } },
                    createdAt: AT
                }
            ]
        });

        expect(view.messages.map((message) => message.payload?.open)).toEqual([false, undefined, false, true]);
        expect(view.messages[1]).toEqual({
            id: '01970000-0000-7000-8000-000000000003',
            role: 'person',
            text: 'pergunta livre',
            createdAt: AT.toISOString(),
            payload: undefined
        });
        expect(view.messages[2]?.role).toBe('system');
    });
});
