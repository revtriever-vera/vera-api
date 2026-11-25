import { describe, expect, it } from 'vitest';
import { CHANNEL_PROFILES, channelProfileOf } from './ask-channel-profiles';

describe('perfil por canal', () => {
    it('o WhatsApp tem a tarefa de hoje, 3 frases, 600 caracteres, negrito do WhatsApp e nenhum link', () => {
        expect(channelProfileOf('whatsapp')).toEqual({
            channel: 'whatsapp',
            task: 'ask_vera_step',
            maxSentences: 3,
            maxChars: 600,
            format: 'whatsapp',
            acceptsLink: false
        });
    });

    it('o app tem a tarefa própria, 5 frases, 900 caracteres, markdown e link', () => {
        expect(channelProfileOf('app')).toEqual({
            channel: 'app',
            task: 'ask_vera_app_step',
            maxSentences: 5,
            maxChars: 900,
            format: 'markdown',
            acceptsLink: true
        });
    });

    it('cada canal usa uma tarefa diferente', () => {
        expect(CHANNEL_PROFILES.app.task).not.toBe(CHANNEL_PROFILES.whatsapp.task);
    });
});
