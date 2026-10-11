import { describe, expect, it, vi } from 'vitest';
import { makeCategory } from '../../../../test/support/spending-factories';
import { normalizeDescription } from '../../spending-categories/services/description-normalizer.service';
import { TransactionCategorizerService } from '../../spending-categories/services/transaction-categorizer.service';
import { buildSpendingDataset, DatasetTransaction, SpendingDataset } from './spending-dataset';

const TODAY: string = '2026-10-11';
const SYSTEM_KEYS: readonly string[] = [
    'housing',
    'education',
    'health',
    'home_services',
    'taxes_fees',
    'groceries',
    'eating_out',
    'transport',
    'leisure',
    'subscriptions',
    'shopping',
    'other_expenses',
    'income',
    'other_income',
    'own_transfer',
    'card_payment',
    'investments'
];

type CategorizerParts = ConstructorParameters<typeof TransactionCategorizerService>;

function buildCategorizer(): TransactionCategorizerService {
    const categories = SYSTEM_KEYS.map((systemKey: string) => makeCategory({ id: systemKey, systemKey, name: null }));
    return new TransactionCategorizerService(
        { listForCompany: vi.fn().mockResolvedValue(categories) } as unknown as CategorizerParts[0],
        { listActive: vi.fn().mockResolvedValue([]) } as unknown as CategorizerParts[1],
        { categorized: vi.fn() } as unknown as CategorizerParts[2]
    );
}

function totalsOf(dataset: SpendingDataset, month: string): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const transaction of dataset.transactions.filter((candidate: DatasetTransaction) => candidate.month === month)) {
        const key: string = transaction.expectedCategory ?? 'none';
        totals[key] = (totals[key] ?? 0) + transaction.amountMinor;
    }
    return totals;
}

const HISTORY_TOTALS: Record<string, number> = {
    income: 2_800_000,
    housing: -770_000,
    education: -320_000,
    health: -138_000,
    groceries: -265_000,
    eating_out: -175_000,
    transport: -120_000,
    leisure: -140_000,
    subscriptions: -61_000,
    shopping: -160_000,
    card_payment: 0,
    investments: -200_000,
    own_transfer: 0
};

const CLOSED_TOTALS: Record<string, number> = {
    income: 2_800_000,
    housing: -770_000,
    education: -320_000,
    health: -140_000,
    groceries: -290_000,
    eating_out: -245_000,
    transport: -130_000,
    leisure: -190_000,
    subscriptions: -64_000,
    shopping: -235_000,
    card_payment: 0,
    investments: -200_000,
    own_transfer: 0,
    none: -80_000
};

describe('spending dataset', () => {
    const dataset: SpendingDataset = buildSpendingDataset(TODAY);

    it('situa os meses em relação ao mês corrente', () => {
        expect(dataset.currentMonth).toBe('2026-10');
        expect(dataset.closedMonth).toBe('2026-09');
        expect(dataset.historyMonths).toEqual(['2026-06', '2026-07', '2026-08']);
        expect(dataset.accounts.map((account) => account.key)).toEqual(['nubank-card', 'nubank-checking', 'itau-checking']);
    });

    it('cada mês de histórico tem exatamente os totais da tabela', () => {
        for (const month of dataset.historyMonths) {
            expect(totalsOf(dataset, month)).toEqual(HISTORY_TOTALS);
        }
    });

    it('a média de M-4 a M-2 por categoria é o total mensal do histórico', () => {
        const history: DatasetTransaction[] = dataset.transactions.filter((transaction) =>
            dataset.historyMonths.includes(transaction.month)
        );
        const sums: Record<string, number> = {};
        for (const transaction of history) {
            const key: string = transaction.expectedCategory ?? 'none';
            sums[key] = (sums[key] ?? 0) + transaction.amountMinor;
        }

        expect(Object.fromEntries(Object.entries(sums).map(([key, total]) => [key, total / dataset.historyMonths.length]))).toEqual(
            HISTORY_TOTALS
        );
    });

    it('o mês fechado reproduz o setembro do protótipo', () => {
        const totals: Record<string, number> = totalsOf(dataset, '2026-09');
        const expenseKeys: string[] = [
            'housing',
            'education',
            'health',
            'groceries',
            'eating_out',
            'transport',
            'leisure',
            'subscriptions',
            'shopping'
        ];
        const categorized: number = expenseKeys.reduce((sum: number, key: string) => sum + (totals[key] ?? 0), 0);

        expect(totals).toEqual(CLOSED_TOTALS);
        expect(totals['income']).toBe(2_800_000);
        expect(categorized).toBe(-2_384_000);
        expect(totals['none']).toBe(-80_000);
        expect(categorized + (totals['none'] ?? 0)).toBe(-2_464_000);
        expect((totals['income'] ?? 0) + categorized + (totals['none'] ?? 0)).toBe(336_000);
    });

    it('o mês corrente tem só a Netflix e a Uber do dia 1', () => {
        const current: DatasetTransaction[] = dataset.transactions.filter((transaction) => transaction.month === '2026-10');

        expect(current.map((transaction) => [transaction.description, transaction.amountMinor, transaction.date])).toEqual([
            ['NETFLIX.COM', -5590, '2026-10-01'],
            ['UBER *TRIP', -1840, '2026-10-01']
        ]);
    });

    it('os dois Pix de Maria Souza têm o mesmo documento sintético e nenhuma categoria esperada', () => {
        const pix: DatasetTransaction[] = dataset.transactions.filter(
            (transaction) => transaction.key.endsWith(':pix-1') || transaction.key.endsWith(':pix-2')
        );

        expect(
            pix.map((transaction) => [
                transaction.date,
                transaction.amountMinor,
                transaction.counterpartyName,
                transaction.counterpartyDocument
            ])
        ).toEqual([
            ['2026-09-14', -35000, 'Maria Souza', '00000000191'],
            ['2026-09-28', -45000, 'Maria Souza', '00000000191']
        ]);
        expect(pix.every((transaction) => transaction.expectedCategory === null && transaction.providerCategoryId === '05000000')).toBe(
            true
        );
    });

    it('é determinístico e as chaves são únicas', () => {
        expect(buildSpendingDataset(TODAY)).toEqual(dataset);
        expect(buildSpendingDataset('2026-10-27').transactions.map((transaction) => transaction.key)).toEqual(
            dataset.transactions.map((transaction) => transaction.key)
        );
        expect(new Set(dataset.transactions.map((transaction) => transaction.key)).size).toBe(dataset.transactions.length);
    });

    it('respeita o fim do mês: dia 31 vira 30 e fevereiro termina em 28', () => {
        const february: SpendingDataset = buildSpendingDataset('2026-03-15');
        const april: SpendingDataset = buildSpendingDataset('2026-05-02');

        expect(february.closedMonth).toBe('2026-02');
        expect(february.transactions.find((transaction) => transaction.key === '2026-02:itau-checking:health-plan')?.date).toBe(
            '2026-02-28'
        );
        expect(april.transactions.find((transaction) => transaction.key === '2026-04:itau-checking:health-plan')?.date).toBe('2026-04-30');
        expect(dataset.transactions.find((transaction) => transaction.key === '2026-08:itau-checking:health-plan')?.date).toBe(
            '2026-08-31'
        );
        expect(february.historyMonths).toEqual(['2025-11', '2025-12', '2026-01']);
    });

    it('o categorizador real de #16 devolve a categoria esperada de cada linha', async () => {
        const categorizer: TransactionCategorizerService = buildCategorizer();

        const results = await categorizer.categorizeMany(
            dataset.transactions.map((transaction) => ({
                amountMinor: transaction.amountMinor,
                normalizedDescription: normalizeDescription(transaction.description),
                counterpartyKey: null,
                providerCategoryId: transaction.providerCategoryId
            }))
        );

        expect(results.map((result) => result.categoryId)).toEqual(dataset.transactions.map((transaction) => transaction.expectedCategory));
    });

    it('o dicionário contém os estabelecimentos que o QA usa', async () => {
        const categorizer: TransactionCategorizerService = buildCategorizer();
        const terms: [string, number][] = [
            ['COLEGIO', -100],
            ['UNIMED', -100],
            ['DROGASIL', -100],
            ['99APP', -100],
            ['INGRESSO COM', -100],
            ['APPLE COM BILL', -100],
            ['PAGAMENTO FATURA', -100],
            ['PAGAMENTO RECEBIDO', 100],
            ['APLICACAO', -100]
        ];

        const results = await categorizer.categorizeMany(
            terms.map(([term, amountMinor]: [string, number]) => ({
                amountMinor,
                normalizedDescription: normalizeDescription(term),
                counterpartyKey: null,
                providerCategoryId: null
            }))
        );

        expect(results.map((result) => result.source)).toEqual(new Array<string>(terms.length).fill('dictionary'));
    });

    it('o dicionário não casa os estabelecimentos que o QA espera sem categoria e casa os exemplos do card', async () => {
        const categorizer: TransactionCategorizerService = buildCategorizer();
        const inputs: string[] = ['PADARIA ESTRELA', 'LIVRARIA CULTURA', 'MERCADO DO ZE', 'IFOOD *LANCHE', 'DROGASIL', 'POSTO IPIRANGA'];

        const results = await categorizer.categorizeMany(
            inputs.map((description: string) => ({
                amountMinor: -1000,
                normalizedDescription: normalizeDescription(description),
                counterpartyKey: null,
                providerCategoryId: null
            }))
        );

        expect(results.map((result) => result.categoryId)).toEqual([null, null, null, 'eating_out', 'health', 'transport']);
    });
});
