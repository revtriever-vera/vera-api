import { describe, expect, it } from 'vitest';
import { LabelSource } from './ai-context.types';
import { AiTextRenderer } from './ai-text-renderer';

const KEYS: ReadonlyMap<string, LabelSource> = new Map<string, LabelSource>([
    ['cat:eating_out', { kind: 'cat', name: 'Delivery e restaurantes' }],
    ['cat:custom_1', { kind: 'cat', name: 'Pets' }],
    ['cls:rf_pos', { kind: 'cls', name: 'Renda fixa pós' }]
]);

describe('AiTextRenderer', () => {
    const renderer: AiTextRenderer = new AiTextRenderer();

    it('troca os marcadores pelo nome, em minúscula no meio da frase', () => {
        const result = renderer.render('Você gastou mais com [[cat:eating_out]] e [[cat:custom_1]] em [[cls:rf_pos]].', KEYS);

        expect(result).toEqual({
            ok: true,
            text: 'Você gastou mais com delivery e restaurantes e pets em renda fixa pós.',
            markers: 3
        });
    });

    it('mantém o nome como está no começo do texto, de frase ou de linha', () => {
        const result = renderer.render('[[cat:custom_1]] subiu. [[cls:rf_pos]] caiu!\n[[cat:eating_out]] ficou.', KEYS);

        expect(result).toEqual({ ok: true, text: 'Pets subiu. Renda fixa pós caiu!\nDelivery e restaurantes ficou.', markers: 3 });
    });

    it('recusa marcador com chave desconhecida ou de outro tipo', () => {
        expect(renderer.render('Gasto em [[cat:inexistente]].', KEYS)).toEqual({
            ok: false,
            reason: 'unknown_marker',
            marker: '[[cat:inexistente]]'
        });
        expect(renderer.render('Classe [[cls:custom_1]].', KEYS)).toMatchObject({ ok: false, reason: 'unknown_marker' });
    });

    it('recusa marcador malformado que sobra no texto', () => {
        expect(renderer.render('Gasto em [[cat:eating_out.', KEYS)).toEqual({ ok: false, reason: 'malformed_marker', marker: null });
        expect(renderer.render('Gasto em [[ cat:eating_out ]].', KEYS)).toMatchObject({ ok: false, reason: 'malformed_marker' });
    });

    it('recusa texto sem marcador quando ele é exigido e aceita quando não é', () => {
        expect(renderer.render('Seus gastos subiram.', KEYS, { requireMarker: true })).toEqual({
            ok: false,
            reason: 'no_marker',
            marker: null
        });
        expect(renderer.render('Seus gastos subiram.', KEYS)).toEqual({ ok: true, text: 'Seus gastos subiram.', markers: 0 });
    });
});
