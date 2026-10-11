import { afterEach, describe, expect, it } from 'vitest';
import { assertEnvironmentCoherent, booleanFlag, devOnlySecret, isProductionEnvironment } from './environment.schema';

describe('coerência entre IS_LOCAL e DEPLOY_ENV', () => {
    it('recusa IS_LOCAL numa conta deployada, que registraria configuração de dev fora do lugar', () => {
        expect(() => {
            assertEnvironmentCoherent(true, 'dev');
        }).toThrow();
    });

    it('recusa IS_LOCAL em produção', () => {
        expect(() => {
            assertEnvironmentCoherent(true, 'prod');
        }).toThrow();
    });

    it('aceita IS_LOCAL na máquina de quem desenvolve', () => {
        expect(() => {
            assertEnvironmentCoherent(true, 'local');
        }).not.toThrow();
    });

    it('aceita ambiente deployado sem IS_LOCAL, que é o caso normal', () => {
        expect(() => {
            assertEnvironmentCoherent(false, 'dev');
        }).not.toThrow();
    });
});

describe('guarda de produção dos scripts', () => {
    it('não confunde dev deployado com produção, mesmo rodando como NODE_ENV=production', () => {
        expect(isProductionEnvironment({ DEPLOY_ENV: 'dev', NODE_ENV: 'production' })).toBe(false);
    });

    it('barra produção declarada', () => {
        expect(isProductionEnvironment({ DEPLOY_ENV: 'prod', NODE_ENV: 'production' })).toBe(true);
    });

    it('cai em NODE_ENV quando DEPLOY_ENV não foi declarado, para não abrir sozinho', () => {
        expect(isProductionEnvironment({ NODE_ENV: 'production' })).toBe(true);
    });

    it('libera a máquina local', () => {
        expect(isProductionEnvironment({ DEPLOY_ENV: 'local', NODE_ENV: 'development' })).toBe(false);
    });
});

describe('devOnlySecret', () => {
    afterEach(() => {
        delete process.env['IS_LOCAL'];
    });

    it('aceita o default de desenvolvimento quando IS_LOCAL=true', () => {
        process.env['IS_LOCAL'] = 'true';
        expect(devOnlySecret('dev-secret', 32).parse(undefined)).toBe('dev-secret');
    });

    it('recusa o default de desenvolvimento fora do local', () => {
        expect(() => devOnlySecret('dev-secret', 32).parse(undefined)).toThrow(/desenvolvimento/);
    });

    it('recusa segredo curto fora do local', () => {
        expect(() => devOnlySecret('dev-secret', 32).parse('curto')).toThrow(/32 caracteres/);
    });

    it('aceita segredo forte fora do local', () => {
        const strong: string = 'a'.repeat(48);
        expect(devOnlySecret('dev-secret', 32).parse(strong)).toBe(strong);
    });
});

describe('booleanFlag', () => {
    afterEach(() => {
        delete process.env['IS_LOCAL'];
    });

    it('usa o default do ambiente local quando IS_LOCAL=true e nada foi declarado', () => {
        process.env['IS_LOCAL'] = 'true';
        expect(booleanFlag(true, false).parse(undefined)).toBe(true);
        expect(booleanFlag(false, true).parse(undefined)).toBe(false);
    });

    it('usa o default deployado quando nada foi declarado fora do local', () => {
        expect(booleanFlag(true, false).parse(undefined)).toBe(false);
        expect(booleanFlag(false, true).parse(undefined)).toBe(true);
    });

    it('valor explícito sempre vence o default', () => {
        process.env['IS_LOCAL'] = 'true';
        expect(booleanFlag(true, false).parse('false')).toBe(false);
        expect(booleanFlag(false, true).parse('true')).toBe(true);
    });
});
