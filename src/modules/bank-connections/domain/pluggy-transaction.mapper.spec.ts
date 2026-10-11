import { describe, expect, it } from 'vitest';
import { PluggyTransaction } from '../ports/pluggy-client.port';
import {
    PLUGGY_CREDIT_SIGN,
    TransactionMappingContext,
    amountMinorOf,
    localDateOf,
    mapTransaction,
    mapTransactions
} from './pluggy-transaction.mapper';

const CHECKING: TransactionMappingContext = { currency: 'BRL', credit: false, shiftInstallmentDates: false };
const CARD: TransactionMappingContext = { currency: 'BRL', credit: true, shiftInstallmentDates: false };

function pluggy(overrides: Partial<PluggyTransaction> = {}): PluggyTransaction {
    return {
        id: 'tx-1',
        accountId: 'acc-1',
        date: '2026-10-05',
        description: 'COMPRA TESTE',
        descriptionRaw: null,
        amount: -50.25,
        currencyCode: 'BRL',
        amountInAccountCurrency: null,
        status: 'POSTED',
        categoryId: '10000000',
        paymentData: null,
        merchant: null,
        installmentNumber: null,
        installmentTotal: null,
        ...overrides
    };
}

describe('pluggy transaction mapper', () => {
    it('fixa o sinal do cartão em -1 para a compra ficar negativa', () => {
        expect(PLUGGY_CREDIT_SIGN).toBe(-1);
    });

    it('mantém o sinal do débito de conta e prefixa o id externo com o provedor', () => {
        const mapped = mapTransaction(pluggy(), CHECKING);

        expect(mapped).toMatchObject({
            externalId: 'pluggy:tx-1',
            amountMinor: -5025,
            currency: 'BRL',
            description: 'COMPRA TESTE',
            providerCategoryId: '10000000'
        });
    });

    it('inverte o sinal da conta de cartão: a compra fica negativa e o estorno positivo', () => {
        expect(mapTransaction(pluggy({ amount: 55.9 }), CARD).amountMinor).toBe(-5590);
        expect(mapTransaction(pluggy({ amount: -20 }), CARD).amountMinor).toBe(2000);
    });

    it('prefere amountInAccountCurrency ao amount', () => {
        const foreign = pluggy({ amount: 10, currencyCode: 'USD', amountInAccountCurrency: 52.37 });

        expect(amountMinorOf(foreign, CARD)).toBe(-5237);
        expect(amountMinorOf(foreign, CHECKING)).toBe(5237);
    });

    it('converte sem erro de ponto flutuante', () => {
        expect(mapTransaction(pluggy({ amount: 0.1 + 0.2 }), CHECKING).amountMinor).toBe(30);
        expect(mapTransaction(pluggy({ amount: 1.005 }), CHECKING).amountMinor).toBe(101);
        expect(mapTransaction(pluggy({ amount: -1234567.89 }), CHECKING).amountMinor).toBe(-123456789);
    });

    it('ignora a transação pendente e conta quantas foram ignoradas', () => {
        const mapped = mapTransactions(
            [pluggy({ id: 'a' }), pluggy({ id: 'b', status: 'PENDING' }), pluggy({ id: 'c', status: 'PENDING' })],
            CHECKING
        );

        expect(mapped.items.map((item) => item.externalId)).toEqual(['pluggy:a']);
        expect(mapped.skippedPending).toBe(2);
    });

    it('usa o recebedor na saída, com o documento só em dígitos', () => {
        const mapped = mapTransaction(
            pluggy({
                amount: -100,
                paymentData: {
                    payer: { name: 'Eu Mesmo', documentNumber: '111.111.111-11' },
                    receiver: { name: 'Maria Souza', documentNumber: '000.000.001-91' }
                }
            }),
            CHECKING
        );

        expect(mapped).toMatchObject({ counterpartyName: 'Maria Souza', counterpartyDocument: '00000000191' });
    });

    it('usa o pagador na entrada', () => {
        const mapped = mapTransaction(
            pluggy({
                amount: 250,
                paymentData: { payer: { name: 'Empresa Pagadora', documentNumber: '00.000.000/0001-91' }, receiver: null }
            }),
            CHECKING
        );

        expect(mapped).toMatchObject({ counterpartyName: 'Empresa Pagadora', counterpartyDocument: '00000000000191' });
    });

    it('sem paymentData usa o estabelecimento, preferindo a razão social, com o CNPJ', () => {
        const withBusiness = mapTransaction(
            pluggy({ merchant: { name: 'Padaria', businessName: 'Padaria Estrela LTDA', cnpj: '00.000.000/0001-91' } }),
            CHECKING
        );
        const onlyName = mapTransaction(pluggy({ merchant: { name: 'Padaria', businessName: ' ', cnpj: null } }), CHECKING);

        expect(withBusiness).toMatchObject({ counterpartyName: 'Padaria Estrela LTDA', counterpartyDocument: '00000000000191' });
        expect(onlyName).toMatchObject({ counterpartyName: 'Padaria', counterpartyDocument: null });
    });

    it('cai no estabelecimento quando o lado de pagamento vem vazio e fica sem favorecido quando não há nada', () => {
        const emptyParty = mapTransaction(
            pluggy({
                paymentData: { payer: null, receiver: { name: ' ', documentNumber: null } },
                merchant: { name: 'Loja', businessName: null, cnpj: null }
            }),
            CHECKING
        );
        const nothing = mapTransaction(pluggy(), CHECKING);

        expect(emptyParty.counterpartyName).toBe('Loja');
        expect(nothing).toMatchObject({ counterpartyName: null, counterpartyDocument: null });
    });

    it('prefere descriptionRaw, cai na description quando vazia e corta em 200', () => {
        expect(mapTransaction(pluggy({ descriptionRaw: 'PIX ENVIADO RAW' }), CHECKING).description).toBe('PIX ENVIADO RAW');
        expect(mapTransaction(pluggy({ descriptionRaw: '  ' }), CHECKING).description).toBe('COMPRA TESTE');
        expect(mapTransaction(pluggy({ description: 'x'.repeat(300) }), CHECKING).description).toHaveLength(200);
    });

    it('leva as parcelas do cartão sem mexer na data quando o deslocamento está desligado', () => {
        const mapped = mapTransaction(pluggy({ date: '2026-01-31', installmentNumber: 2, installmentTotal: 6 }), CARD);

        expect(mapped).toMatchObject({ date: '2026-01-31', installmentNumber: 2, installmentTotal: 6 });
    });

    it('com o deslocamento ligado soma installmentNumber - 1 meses, com teto no último dia do mês', () => {
        const shifting: TransactionMappingContext = { ...CARD, shiftInstallmentDates: true };

        expect(mapTransaction(pluggy({ date: '2026-01-31', installmentNumber: 2, installmentTotal: 6 }), shifting).date).toBe('2026-02-28');
        expect(mapTransaction(pluggy({ date: '2028-01-31', installmentNumber: 2, installmentTotal: 6 }), shifting).date).toBe('2028-02-29');
        expect(mapTransaction(pluggy({ date: '2026-11-15', installmentNumber: 3, installmentTotal: 6 }), shifting).date).toBe('2027-01-15');
        expect(mapTransaction(pluggy({ date: '2026-01-31', installmentNumber: 1, installmentTotal: 6 }), shifting).date).toBe('2026-01-31');
        expect(mapTransaction(pluggy({ date: '2026-01-31' }), shifting).date).toBe('2026-01-31');
    });

    it('converte o instante da Pluggy para a data de America/Sao_Paulo', () => {
        expect(localDateOf('2026-10-05T03:00:00.000Z')).toBe('2026-10-05');
        expect(localDateOf('2026-10-06T02:30:00.000Z')).toBe('2026-10-05');
        expect(localDateOf('2026-10-05T12:00:00.000Z')).toBe('2026-10-05');
        expect(localDateOf('2026-10-05')).toBe('2026-10-05');
        expect(localDateOf('lixo')).toBe('lixo');
    });
});
