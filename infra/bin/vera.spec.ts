import { describe, expect, it, vi } from 'vitest';
import { selectedEnvironments, synthesizeFromEnvironment } from './vera';
import { fakeEnvironment } from '../test/fixtures';

vi.setConfig({ testTimeout: 30_000 });

describe('selectedEnvironments', () => {
    it('usa dev e prod quando VERA_ENVIRONMENTS não existe', () => {
        expect(selectedEnvironments({})).toEqual(['dev', 'prod']);
    });

    it('aceita um subconjunto', () => {
        expect(selectedEnvironments({ VERA_ENVIRONMENTS: ' prod ' })).toEqual(['prod']);
    });

    it('recusa ambiente desconhecido', () => {
        expect(() => selectedEnvironments({ VERA_ENVIRONMENTS: 'staging' })).toThrow('VERA_ENVIRONMENTS inválida: staging');
    });
});

describe('synthesizeFromEnvironment', () => {
    it('sintetiza as quatro pilhas de cada ambiente', () => {
        const ids: string[] = synthesizeFromEnvironment(fakeEnvironment())
            .node.children.map((child): string => child.node.id)
            .sort();

        expect(ids).toEqual(
            [
                'vera-cert-dev',
                'vera-cert-prod',
                'vera-data-dev',
                'vera-data-prod',
                'vera-mail-dev',
                'vera-mail-prod',
                'vera-network-dev',
                'vera-network-prod'
            ].filter((id: string): boolean => ids.includes(id))
        );
        expect(ids).toHaveLength(8);
    });

    it('sintetiza só prod sem exigir as variáveis de dev', () => {
        const env = fakeEnvironment({ VERA_ENVIRONMENTS: 'prod', AWS_ACCOUNT_ID_DEV: undefined, SHARED_INFRA_DEV: undefined });

        expect(synthesizeFromEnvironment(env).node.children).toHaveLength(4);
    });

    it('falha com mensagem clara quando falta variável', () => {
        expect(() => synthesizeFromEnvironment({})).toThrow('VERA_DOMAIN não definida');
    });
});
