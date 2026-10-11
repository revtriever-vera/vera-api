import { describe, expect, it } from 'vitest';
import { makeClass } from '../../../../test/support/allocation-factories';
import { ClassDisplayNameService } from './class-display-name.service';

describe('ClassDisplayNameService', () => {
    const service: ClassDisplayNameService = new ClassDisplayNameService();

    it('devolve o nome do usuário quando existe', () => {
        expect(service.nameOf(makeClass({ systemKey: 'fii', name: 'Imóveis' }), 'en')).toBe('Imóveis');
    });

    it('traduz o nome padrão pela systemKey e pelo idioma', () => {
        const fii = makeClass({ systemKey: 'fii', name: null });

        expect(service.nameOf(fii, 'pt-BR')).toBe('FIIs');
        expect(service.nameOf(fii, 'en')).toBe('Brazilian REITs (FIIs)');
    });

    it('classe sem nome e sem chave conhecida devolve vazio', () => {
        expect(service.nameOf(makeClass({ systemKey: null, name: null }), 'en')).toBe('');
        expect(service.nameOf(makeClass({ systemKey: 'desconhecida', name: null }), 'en')).toBe('');
    });

    it('reserva os nomes padrão nos dois idiomas até a classe ser renomeada', () => {
        expect(service.takenNamesOf(makeClass({ systemKey: 'cripto', name: null }))).toEqual(['cripto', 'crypto']);
        expect(service.takenNamesOf(makeClass({ systemKey: 'cripto', name: 'Moedas Digitais' }))).toEqual(['moedas digitais']);
        expect(service.takenNamesOf(makeClass({ systemKey: null, name: null }))).toEqual([]);
    });
});
