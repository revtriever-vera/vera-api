import { describe, expect, it } from 'vitest';
import {
    REMINDER_TEMPLATE_KEY,
    TEMPLATE_CATALOG,
    catalogDefinitions,
    currentTemplateName,
    placeholdersOf,
    remoteNameOf,
    versionOf
} from './template-catalog';

describe('template-catalog', () => {
    it('declara só o lembrete, em pt_BR e en, com nomes e idiomas únicos', () => {
        const definitions = catalogDefinitions();
        const keys: string[] = definitions.map((definition) => `${definition.name}:${definition.language}`);

        expect(TEMPLATE_CATALOG.map((entry) => entry.key)).toEqual([REMINDER_TEMPLATE_KEY]);
        expect(new Set(keys).size).toBe(keys.length);
        expect(definitions.map((definition) => definition.language).sort()).toEqual(['en', 'pt_BR']);
        expect(new Set(definitions.map((definition) => definition.category))).toEqual(new Set(['UTILITY']));
    });

    it('cada texto tem o mesmo número de placeholders dos exemplos', () => {
        for (const definition of catalogDefinitions()) {
            expect(placeholdersOf(definition.body)).toBe(definition.examples.length);
        }
    });

    it('declara os três botões de resposta rápida do lembrete em cada idioma', () => {
        for (const definition of catalogDefinitions()) {
            expect(definition.quickReplies).toHaveLength(3);
        }
    });

    it('versiona o nome: a 1 é o nome limpo, as seguintes ganham sufixo', () => {
        expect(remoteNameOf('vera_lembrete', 1)).toBe('vera_lembrete');
        expect(remoteNameOf('vera_lembrete', 2)).toBe('vera_lembrete_v2');
        expect(versionOf('vera_lembrete')).toBe(1);
        expect(versionOf('desconhecido')).toBe(1);
    });

    it('resolve o nome atual pela chave', () => {
        expect(currentTemplateName(REMINDER_TEMPLATE_KEY)).toBe('vera_lembrete_v2');
        expect(currentTemplateName('outro')).toBeNull();
    });
});
