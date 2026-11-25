import { describe, expect, it } from 'vitest';
import { LlmMessage } from '../llm.types';
import { aiSdkMessagesOf } from './ai-sdk-messages';

const PNG: Uint8Array = new Uint8Array([137, 80, 78, 71]);
const PDF: Uint8Array = new Uint8Array([37, 80, 68, 70]);

describe('aiSdkMessagesOf', () => {
    it('monta imagem e PDF como partes do usuário, na ordem, com o tipo de mídia', () => {
        const messages: LlmMessage[] = [
            {
                role: 'user',
                content: [
                    { kind: 'text', text: 'extraia as operações' },
                    { kind: 'image', mediaType: 'image/png', data: PNG },
                    { kind: 'file', mediaType: 'application/pdf', data: PDF }
                ]
            }
        ];

        expect(aiSdkMessagesOf(messages)).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'extraia as operações' },
                    { type: 'image', image: PNG, mediaType: 'image/png' },
                    { type: 'file', data: PDF, mediaType: 'application/pdf' }
                ]
            }
        ]);
    });

    it('resultado de ferramenta continua separado das partes do usuário', () => {
        const messages: LlmMessage[] = [
            { role: 'assistant', content: [{ kind: 'tool_use', toolUseId: 't1', name: 'x', input: {} }] },
            {
                role: 'user',
                content: [
                    { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false },
                    { kind: 'image', mediaType: 'image/jpeg', data: PNG }
                ]
            }
        ];

        const result = aiSdkMessagesOf(messages);

        expect(result.map((message) => message.role)).toEqual(['assistant', 'tool', 'user']);
    });
});
