import { describe, expect, it } from 'vitest';
import { interactivePayloadOf } from './interactive';
import { clip, splitIntoBlocks, toWhatsAppMarkup } from './whatsapp-format';

describe('toWhatsAppMarkup', () => {
    it('converte negrito, títulos, listas e links', () => {
        const markup: string = toWhatsAppMarkup('# Resumo\n**Total** e __extra__\n- um\n* dois\n[site](https://example.com)');

        expect(markup).toBe('*Resumo*\n*Total* e *extra*\n• um\n• dois\nsite (https://example.com)');
    });

    it('mantém o texto sem marcação como está', () => {
        expect(toWhatsAppMarkup('olá, tudo bem?')).toBe('olá, tudo bem?');
    });
});

describe('splitIntoBlocks', () => {
    it('mantém o texto curto em um bloco', () => {
        expect(splitIntoBlocks('a\n\nb')).toEqual(['a\n\nb']);
    });

    it('corta em quebra de parágrafo quando passa do limite', () => {
        const blocks: string[] = splitIntoBlocks('aaaa\n\nbbbb\n\ncccc', 10);

        expect(blocks).toEqual(['aaaa\n\nbbbb', 'cccc']);
    });

    it('corta o parágrafo longo no espaço, sem quebrar palavra', () => {
        const blocks: string[] = splitIntoBlocks('palavra uma palavra duas palavra tres', 15);

        expect(blocks.every((block: string): boolean => block.length <= 15)).toBe(true);
        expect(blocks.join(' ')).toBe('palavra uma palavra duas palavra tres');
    });

    it('corta no limite quando não há espaço', () => {
        expect(splitIntoBlocks('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
    });

    it('usa o limite de 4.000 caracteres por padrão', () => {
        const blocks: string[] = splitIntoBlocks(`${'palavra '.repeat(700)}fim`);

        expect(blocks).toHaveLength(2);
        expect(blocks.every((block: string): boolean => block.length <= 4000)).toBe(true);
    });
});

describe('interactivePayloadOf', () => {
    const choice = (index: number): { id: string; title: string } => ({
        id: `rem:done:${String(index)}`,
        title: `Opção muito longa número ${String(index)}`
    });

    it('usa botões de resposta até 3 opções e corta o título em 20 caracteres', () => {
        const payload: { type: string; action: { buttons: { reply: { id: string; title: string } }[] } } = interactivePayloadOf({
            body: 'Escolha',
            choices: [choice(1), choice(2)]
        }) as never;

        expect(payload.type).toBe('button');
        expect(payload.action.buttons).toHaveLength(2);
        expect(payload.action.buttons[0]?.reply.title.length).toBeLessThanOrEqual(20);
        expect(payload.action.buttons[0]?.reply.id).toBe('rem:done:1');
    });

    it('usa lista a partir de 4 opções, no máximo 10, com título em 24 caracteres', () => {
        const choices = Array.from({ length: 12 }, (_unused: unknown, index: number) => choice(index));
        const payload: { type: string; action: { sections: { rows: { title: string }[] }[] } } = interactivePayloadOf({
            body: 'Escolha',
            choices
        }) as never;

        expect(payload.type).toBe('list');
        expect(payload.action.sections[0]?.rows).toHaveLength(10);
        expect(payload.action.sections[0]?.rows[0]?.title.length).toBeLessThanOrEqual(24);
    });
});

describe('clip', () => {
    it('não corta o que cabe e conta caracteres, não bytes', () => {
        expect(clip('ação', 4)).toBe('ação');
        expect(clip('ação extra', 4)).toBe('ação');
    });
});
