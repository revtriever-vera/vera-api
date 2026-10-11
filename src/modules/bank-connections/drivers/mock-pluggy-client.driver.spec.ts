import { describe, expect, it } from 'vitest';
import {
    configOf,
    CLIENT_ID,
    ITEM_ITAU,
    ITEM_LOGIN_ERROR,
    ITEM_MISSING,
    ITEM_NUBANK
} from '../../../../test/support/bank-connections-fakes';
import { SpendingDatasetService } from '../../transactions/services/spending-dataset.service';
import { PluggyAccount, PluggyTransaction, PluggyTransactionPage } from '../ports/pluggy-client.port';
import { MOCK_INVALID_SECRET, MOCK_PAGE_SIZE, MOCK_UNAVAILABLE_SECRET, MockPluggyClientDriver } from './mock-pluggy-client.driver';
import { PluggyCredentialsPlain, PluggySession } from './pluggy-session';

function driverOf(overrides: Parameters<typeof configOf>[0] = {}): MockPluggyClientDriver {
    return new MockPluggyClientDriver(configOf(overrides), new SpendingDatasetService());
}

const SESSION: PluggySession = new PluggySession('mock-api-key');
const ALL_FROM: string = '2000-01-01';
const ALL_TO: string = '2999-12-31';

async function allTransactions(driver: MockPluggyClientDriver, accountId: string): Promise<PluggyTransaction[]> {
    const collected: PluggyTransaction[] = [];
    let cursor: string | null = null;
    do {
        const page: PluggyTransactionPage = await driver.listTransactions(SESSION, { accountId, from: ALL_FROM, to: ALL_TO, cursor });
        collected.push(...page.items);
        cursor = page.next;
    } while (cursor !== null);
    return collected;
}

describe('MockPluggyClientDriver', () => {
    it('aceita qualquer client id e recusa o segredo de teste inválido com 401', async () => {
        const driver: MockPluggyClientDriver = driverOf();

        await expect(driver.authenticate(new PluggyCredentialsPlain(CLIENT_ID, 'qualquer-segredo-valido'))).resolves.toBeInstanceOf(
            PluggySession
        );
        await expect(driver.authenticate(new PluggyCredentialsPlain(CLIENT_ID, MOCK_INVALID_SECRET))).rejects.toMatchObject({
            name: 'PluggyAuthRejectedError'
        });
    });

    it('simula a Pluggy fora do ar com o segredo de indisponibilidade', async () => {
        await expect(driverOf().authenticate(new PluggyCredentialsPlain(CLIENT_ID, MOCK_UNAVAILABLE_SECRET))).rejects.toMatchObject({
            name: 'PluggyUnavailableError',
            httpStatus: 503
        });
    });

    it('MOCK_PLUGGY_FORCE_401 derruba toda autenticação', async () => {
        await expect(
            driverOf({ MOCK_PLUGGY_FORCE_401: true }).authenticate(new PluggyCredentialsPlain(CLIENT_ID, 'segredo-valido-1234'))
        ).rejects.toMatchObject({
            name: 'PluggyAuthRejectedError'
        });
    });

    it('devolve os itens do mock e nulo para o inexistente, o desconhecido e o revogado', async () => {
        const driver: MockPluggyClientDriver = driverOf({ MOCK_PLUGGY_REVOKED_ITEMS: [ITEM_ITAU] });

        expect(await driver.getItem(SESSION, ITEM_NUBANK)).toMatchObject({ connectorName: 'Nubank', status: 'UPDATED', id: ITEM_NUBANK });
        expect(await driver.getItem(SESSION, ITEM_LOGIN_ERROR)).toMatchObject({ status: 'LOGIN_ERROR', executionStatus: 'LOGIN_ERROR' });
        expect(await driver.getItem(SESSION, ITEM_MISSING)).toBeNull();
        expect(await driver.getItem(SESSION, ITEM_ITAU)).toBeNull();
        expect(await driver.getItem(SESSION, '11111111-1111-4111-8111-111111111111')).toBeNull();
        expect(await driverOf().getItem(SESSION, ITEM_ITAU.toUpperCase())).toMatchObject({ connectorName: 'Itaú' });
    });

    it('lista as contas de cada item', async () => {
        const driver: MockPluggyClientDriver = driverOf();

        const nubank: readonly PluggyAccount[] = await driver.listAccounts(SESSION, ITEM_NUBANK);
        const itau: readonly PluggyAccount[] = await driver.listAccounts(SESSION, ITEM_ITAU);

        expect(nubank.map((account: PluggyAccount) => account.id).sort()).toEqual(['nubank-card', 'nubank-checking']);
        expect(nubank.find((account: PluggyAccount) => account.id === 'nubank-card')).toMatchObject({
            type: 'CREDIT',
            subtype: 'CREDIT_CARD'
        });
        expect(itau.map((account: PluggyAccount) => account.id)).toEqual(['itau-checking']);
        expect(await driver.listAccounts(SESSION, ITEM_MISSING)).toEqual([]);
    });

    it('pagina as transações de 50 em 50 com cursor, cobrindo o conjunto canônico', async () => {
        const driver: MockPluggyClientDriver = driverOf();
        const first: PluggyTransactionPage = await driver.listTransactions(SESSION, {
            accountId: 'nubank-card',
            from: ALL_FROM,
            to: ALL_TO,
            cursor: null
        });

        const all: PluggyTransaction[] = await allTransactions(driver, 'nubank-card');

        expect(first.items).toHaveLength(MOCK_PAGE_SIZE);
        expect(first.next).toBe(String(MOCK_PAGE_SIZE));
        expect(all.length).toBeGreaterThan(MOCK_PAGE_SIZE);
        expect(new Set(all.map((transaction: PluggyTransaction) => transaction.id)).size).toBe(all.length);
    });

    it('entrega o valor do cartão com o sinal da Pluggy, invertido em relação ao conjunto canônico', async () => {
        const driver: MockPluggyClientDriver = driverOf();
        const card: PluggyTransaction[] = await allTransactions(driver, 'nubank-card');
        const checking: PluggyTransaction[] = await allTransactions(driver, 'itau-checking');

        expect(card.find((transaction: PluggyTransaction) => transaction.description === 'NETFLIX.COM')?.amount).toBe(55.9);
        expect(checking.find((transaction: PluggyTransaction) => transaction.description === 'ALUGUEL IMOBILIARIA LOPES')?.amount).toBe(
            -6500
        );
    });

    it('leva o documento do favorecido dos Pix e a categoria da Pluggy', async () => {
        const checking: PluggyTransaction[] = await allTransactions(driverOf(), 'itau-checking');

        const pix: PluggyTransaction | undefined = checking.find((transaction: PluggyTransaction) =>
            transaction.description.startsWith('Pix enviado')
        );
        expect(pix).toMatchObject({
            paymentData: { payer: null, receiver: { name: 'Maria Souza', documentNumber: '00000000191' } },
            categoryId: '05000000',
            status: 'POSTED'
        });
        expect(checking.find((transaction: PluggyTransaction) => transaction.categoryId === '17000000')).toBeDefined();
    });

    it('filtra pela janela de datas e trata cursor inválido como o começo', async () => {
        const driver: MockPluggyClientDriver = driverOf();
        const all: PluggyTransaction[] = await allTransactions(driver, 'nubank-checking');
        const last: string = all[all.length - 1]?.date ?? '';

        const since: PluggyTransactionPage = await driver.listTransactions(SESSION, {
            accountId: 'nubank-checking',
            from: last,
            to: last,
            cursor: 'lixo'
        });

        expect(since.items.length).toBeGreaterThan(0);
        expect(since.items.every((transaction: PluggyTransaction) => transaction.date === last)).toBe(true);
        expect(since.next).toBeNull();
    });
});
