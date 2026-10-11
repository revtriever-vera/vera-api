import { describe, expect, it } from 'vitest';
import { PluggyAccount } from '../ports/pluggy-client.port';
import { mapAccount } from './pluggy-account.mapper';

function account(overrides: Partial<PluggyAccount> = {}): PluggyAccount {
    return {
        id: 'acc-1',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        name: 'Conta Corrente',
        marketingName: null,
        number: '12345-6',
        currencyCode: 'BRL',
        ...overrides
    };
}

describe('pluggy account mapper', () => {
    it.each([
        ['BANK', 'CHECKING_ACCOUNT', 'checking'],
        ['BANK', 'SAVINGS_ACCOUNT', 'savings'],
        ['BANK', 'OUTRA', 'other'],
        ['BANK', null, 'other'],
        ['CREDIT', 'CREDIT_CARD', 'credit_card'],
        ['CREDIT', null, 'credit_card'],
        ['INVESTMENT', 'FUND', 'other']
    ])('mapeia %s/%s para %s', (type, subtype, kind) => {
        expect(mapAccount(account({ type, subtype }), 'Nubank').kind).toBe(kind);
    });

    it('usa o nome de marketing, o conector como instituição e o id da Pluggy como id externo', () => {
        const mapped = mapAccount(account({ marketingName: 'Conta Nubank' }), 'Nubank');

        expect(mapped).toMatchObject({
            provider: 'pluggy',
            externalId: 'acc-1',
            name: 'Conta Nubank',
            institutionName: 'Nubank',
            currency: 'BRL'
        });
        expect(mapAccount(account({ marketingName: '  ' }), null)).toMatchObject({ name: 'Conta Corrente', institutionName: null });
    });

    it('corta o nome em 60 caracteres e normaliza a moeda', () => {
        const mapped = mapAccount(account({ name: 'n'.repeat(90), currencyCode: 'brl' }), null);

        expect(mapped.name).toHaveLength(60);
        expect(mapped.currency).toBe('BRL');
    });

    it('guarda só os 4 últimos dígitos do número, mesmo mascarado', () => {
        expect(mapAccount(account({ number: '12345-6' }), null).numberLast4).toBe('3456');
        expect(mapAccount(account({ number: '**** **** **** 4321' }), null).numberLast4).toBe('4321');
        expect(mapAccount(account({ number: '**12' }), null).numberLast4).toBeNull();
        expect(mapAccount(account({ number: null }), null).numberLast4).toBeNull();
    });
});
