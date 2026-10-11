import { describe, expect, it } from 'vitest';
import { parseBankConnectionsConfig } from './bank-connections.config';

describe('parseBankConnectionsConfig', () => {
    it('usa mock, a base oficial e o timeout padrão no ambiente local', () => {
        expect(parseBankConnectionsConfig({ IS_LOCAL: 'true' })).toEqual({
            PLUGGY_DRIVER: 'mock',
            PLUGGY_BASE_URL: 'https://api.pluggy.ai',
            PLUGGY_HTTP_TIMEOUT_MS: 10_000,
            PLUGGY_AUTH_PATH: '/auth',
            PLUGGY_ITEM_PATH: '/items',
            PLUGGY_ACCOUNTS_PATH: '/accounts',
            PLUGGY_TRANSACTIONS_V2_PATH: '/v2/transactions',
            PLUGGY_TRANSACTIONS_LEGACY_PATH: '/transactions',
            PLUGGY_TRANSACTIONS_API: 'v2',
            PLUGGY_SYNC_JOBS_PER_MINUTE: 30,
            PLUGGY_SYNC_SPACING_MS: 2000,
            PLUGGY_INITIAL_HISTORY_DAYS: 365,
            PLUGGY_SHIFT_INSTALLMENT_DATES: false,
            PLUGGY_MOCK_ALLOWED: true,
            MOCK_PLUGGY_FORCE_401: false,
            MOCK_PLUGGY_REVOKED_ITEMS: []
        });
    });

    it('trata variáveis em branco como ausentes', () => {
        const settings = parseBankConnectionsConfig({
            IS_LOCAL: 'true',
            PLUGGY_DRIVER: '',
            PLUGGY_BASE_URL: ' ',
            PLUGGY_HTTP_TIMEOUT_MS: '',
            MOCK_PLUGGY_REVOKED_ITEMS: ''
        });

        expect(settings).toMatchObject({ PLUGGY_DRIVER: 'mock', PLUGGY_BASE_URL: 'https://api.pluggy.ai', PLUGGY_HTTP_TIMEOUT_MS: 10_000 });
    });

    it('lê os valores informados, tira a barra final da base e normaliza os itens revogados', () => {
        const settings = parseBankConnectionsConfig({
            PLUGGY_DRIVER: 'live',
            PLUGGY_BASE_URL: 'https://pluggy.example/',
            PLUGGY_HTTP_TIMEOUT_MS: '2500',
            PLUGGY_AUTH_PATH: '/v2/auth',
            PLUGGY_ITEM_PATH: '/v2/items',
            PLUGGY_ACCOUNTS_PATH: '/v2/accounts',
            PLUGGY_TRANSACTIONS_API: 'legacy',
            PLUGGY_SYNC_JOBS_PER_MINUTE: '12',
            PLUGGY_SYNC_SPACING_MS: '0',
            PLUGGY_INITIAL_HISTORY_DAYS: '90',
            PLUGGY_SHIFT_INSTALLMENT_DATES: 'true',
            MOCK_PLUGGY_FORCE_401: 'true',
            MOCK_PLUGGY_REVOKED_ITEMS: ' AAA , bbb ,,'
        });

        expect(settings).toEqual({
            PLUGGY_DRIVER: 'live',
            PLUGGY_BASE_URL: 'https://pluggy.example',
            PLUGGY_HTTP_TIMEOUT_MS: 2500,
            PLUGGY_AUTH_PATH: '/v2/auth',
            PLUGGY_ITEM_PATH: '/v2/items',
            PLUGGY_ACCOUNTS_PATH: '/v2/accounts',
            PLUGGY_TRANSACTIONS_V2_PATH: '/v2/transactions',
            PLUGGY_TRANSACTIONS_LEGACY_PATH: '/transactions',
            PLUGGY_TRANSACTIONS_API: 'legacy',
            PLUGGY_SYNC_JOBS_PER_MINUTE: 12,
            PLUGGY_SYNC_SPACING_MS: 0,
            PLUGGY_INITIAL_HISTORY_DAYS: 90,
            PLUGGY_SHIFT_INSTALLMENT_DATES: true,
            PLUGGY_MOCK_ALLOWED: false,
            MOCK_PLUGGY_FORCE_401: true,
            MOCK_PLUGGY_REVOKED_ITEMS: ['aaa', 'bbb']
        });
    });

    it('exige o driver explícito fora do ambiente local', () => {
        expect(() => parseBankConnectionsConfig({})).toThrow('PLUGGY_DRIVER');
        expect(() => parseBankConnectionsConfig({ IS_LOCAL: 'false' })).toThrow('PLUGGY_DRIVER');
        expect(parseBankConnectionsConfig({ PLUGGY_DRIVER: 'mock' }).PLUGGY_DRIVER).toBe('mock');
    });

    it('recusa driver, url, timeout e caminho inválidos', () => {
        expect(() => parseBankConnectionsConfig({ IS_LOCAL: 'true', PLUGGY_DRIVER: 'sandbox' })).toThrow();
        expect(() => parseBankConnectionsConfig({ IS_LOCAL: 'true', PLUGGY_BASE_URL: 'not a url' })).toThrow();
        expect(() => parseBankConnectionsConfig({ IS_LOCAL: 'true', PLUGGY_HTTP_TIMEOUT_MS: '0' })).toThrow();
        expect(() => parseBankConnectionsConfig({ IS_LOCAL: 'true', PLUGGY_AUTH_PATH: 'auth' })).toThrow();
    });
});
