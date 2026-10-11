import { addMonths, dateInMonth, monthOf } from './calendar';
import { AccountKind } from './transactions.types';

export type DatasetAccountKey = 'nubank-card' | 'nubank-checking' | 'itau-checking';

export interface DatasetAccount {
    readonly key: DatasetAccountKey;
    readonly kind: AccountKind;
    readonly name: string;
    readonly institutionName: string;
    readonly numberLast4: string;
    readonly currency: string;
}

export interface DatasetTransaction {
    readonly key: string;
    readonly accountKey: DatasetAccountKey;
    readonly date: string;
    readonly month: string;
    readonly description: string;
    readonly amountMinor: number;
    readonly counterpartyName: string | null;
    readonly counterpartyDocument: string | null;
    readonly providerCategoryId: string | null;
    readonly expectedCategory: string | null;
}

export interface SpendingDataset {
    readonly currentMonth: string;
    readonly closedMonth: string;
    readonly historyMonths: readonly string[];
    readonly accounts: readonly DatasetAccount[];
    readonly transactions: readonly DatasetTransaction[];
}

interface EntrySpec {
    readonly slug: string;
    readonly account: DatasetAccountKey;
    readonly day: number;
    readonly description: string;
    readonly amountMinor: number;
    readonly category: string | null;
    readonly providerCategoryId?: string;
    readonly counterpartyName?: string;
    readonly counterpartyDocument?: string;
}

export const DATASET_ACCOUNTS: readonly DatasetAccount[] = [
    { key: 'nubank-card', kind: 'credit_card', name: 'Nubank Cartão', institutionName: 'Nubank', numberLast4: '4321', currency: 'BRL' },
    { key: 'nubank-checking', kind: 'checking', name: 'Nubank Conta', institutionName: 'Nubank', numberLast4: '8765', currency: 'BRL' },
    { key: 'itau-checking', kind: 'checking', name: 'Itaú Conta Corrente', institutionName: 'Itaú', numberLast4: '1234', currency: 'BRL' }
];

export const PLUGGY_INCOME: string = '01010000';
export const PLUGGY_OWN_TRANSFER: string = '04000000';
export const PLUGGY_PIX_TO_THIRD_PARTY: string = '05000000';
export const PLUGGY_GROCERIES: string = '10000000';
export const PLUGGY_EATING_OUT: string = '11000000';
export const PLUGGY_HOUSING: string = '17000000';
export const SYNTHETIC_DOCUMENT: string = '00000000191';

const SALARY: EntrySpec = {
    slug: 'salary',
    account: 'itau-checking',
    day: 5,
    description: 'SALARIO EMPRESA X',
    amountMinor: 2_800_000,
    category: 'income',
    providerCategoryId: PLUGGY_INCOME
};

const RENT: EntrySpec = {
    slug: 'rent',
    account: 'itau-checking',
    day: 6,
    description: 'ALUGUEL IMOBILIARIA LOPES',
    amountMinor: -650_000,
    category: 'housing',
    providerCategoryId: PLUGGY_HOUSING
};

const CONDO: EntrySpec = {
    slug: 'condo',
    account: 'itau-checking',
    day: 10,
    description: 'CONDOMINIO EDIFICIO SOL',
    amountMinor: -120_000,
    category: 'housing',
    providerCategoryId: PLUGGY_HOUSING
};

const SCHOOL: EntrySpec = {
    slug: 'school',
    account: 'itau-checking',
    day: 8,
    description: 'COLEGIO ALFA',
    amountMinor: -320_000,
    category: 'education'
};

const FIXED_AND_TRANSFERS: readonly EntrySpec[] = [
    SALARY,
    RENT,
    CONDO,
    SCHOOL,
    { slug: 'gym', account: 'nubank-card', day: 3, description: 'SMART FIT', amountMinor: -12_990, category: 'health' },
    { slug: 'health-plan', account: 'itau-checking', day: 31, description: 'UNIMED BH', amountMinor: -125_010, category: 'health' },
    { slug: 'netflix', account: 'nubank-card', day: 7, description: 'NETFLIX.COM', amountMinor: -5_590, category: 'subscriptions' },
    { slug: 'spotify', account: 'nubank-card', day: 7, description: 'SPOTIFY', amountMinor: -3_490, category: 'subscriptions' },
    {
        slug: 'card-bill',
        account: 'itau-checking',
        day: 10,
        description: 'PAGAMENTO FATURA NUBANK',
        amountMinor: -900_000,
        category: 'card_payment'
    },
    {
        slug: 'card-bill-received',
        account: 'nubank-card',
        day: 10,
        description: 'PAGAMENTO RECEBIDO',
        amountMinor: 900_000,
        category: 'card_payment'
    },
    { slug: 'cdb', account: 'itau-checking', day: 15, description: 'APLICACAO CDB', amountMinor: -200_000, category: 'investments' },
    {
        slug: 'own-transfer-out',
        account: 'itau-checking',
        day: 17,
        description: 'TRANSF MESMA TITULARIDADE',
        amountMinor: -100_000,
        category: 'own_transfer',
        providerCategoryId: PLUGGY_OWN_TRANSFER
    },
    {
        slug: 'own-transfer-in',
        account: 'nubank-checking',
        day: 17,
        description: 'TRANSF MESMA TITULARIDADE',
        amountMinor: 100_000,
        category: 'own_transfer',
        providerCategoryId: PLUGGY_OWN_TRANSFER
    }
];

const HISTORY_VARIABLE: readonly EntrySpec[] = [
    { slug: 'apple', account: 'nubank-card', day: 16, description: 'APPLE COM BILL', amountMinor: -51_920, category: 'subscriptions' },
    {
        slug: 'groceries-1',
        account: 'nubank-card',
        day: 12,
        description: 'PAO DE ACUCAR 1243',
        amountMinor: -165_000,
        category: 'groceries'
    },
    {
        slug: 'groceries-2',
        account: 'itau-checking',
        day: 20,
        description: 'SUPERMERCADO BOM PRECO',
        amountMinor: -100_000,
        category: 'groceries',
        providerCategoryId: PLUGGY_GROCERIES
    },
    {
        slug: 'delivery',
        account: 'nubank-card',
        day: 15,
        description: 'IFOOD *RESTAURANTE SABOR',
        amountMinor: -75_000,
        category: 'eating_out'
    },
    {
        slug: 'restaurant',
        account: 'nubank-card',
        day: 22,
        description: 'RESTAURANTE COCO BAMBU',
        amountMinor: -100_000,
        category: 'eating_out',
        providerCategoryId: PLUGGY_EATING_OUT
    },
    { slug: 'ride', account: 'nubank-card', day: 9, description: 'UBER *TRIP', amountMinor: -20_000, category: 'transport' },
    { slug: 'fuel', account: 'nubank-card', day: 18, description: 'SHELL BOX POSTO', amountMinor: -100_000, category: 'transport' },
    { slug: 'cinema', account: 'nubank-card', day: 25, description: 'CINEMARK SHOPPING', amountMinor: -40_000, category: 'leisure' },
    { slug: 'tickets', account: 'nubank-card', day: 27, description: 'INGRESSO COM', amountMinor: -100_000, category: 'leisure' },
    { slug: 'amazon', account: 'nubank-card', day: 11, description: 'AMAZON MARKETPLACE', amountMinor: -60_000, category: 'shopping' },
    { slug: 'mercadolivre', account: 'nubank-card', day: 24, description: 'MERCADOLIVRE', amountMinor: -100_000, category: 'shopping' }
];

const CLOSED_VARIABLE: readonly EntrySpec[] = [
    { slug: 'pharmacy', account: 'nubank-card', day: 13, description: 'DROGASIL', amountMinor: -2_000, category: 'health' },
    { slug: 'apple', account: 'nubank-card', day: 16, description: 'APPLE COM BILL', amountMinor: -54_920, category: 'subscriptions' },
    {
        slug: 'groceries-1',
        account: 'nubank-card',
        day: 12,
        description: 'PAO DE ACUCAR 1243',
        amountMinor: -41_230,
        category: 'groceries'
    },
    {
        slug: 'groceries-2',
        account: 'itau-checking',
        day: 20,
        description: 'SUPERMERCADO BOM PRECO',
        amountMinor: -248_770,
        category: 'groceries',
        providerCategoryId: PLUGGY_GROCERIES
    },
    {
        slug: 'delivery',
        account: 'nubank-card',
        day: 15,
        description: 'IFOOD *RESTAURANTE SABOR',
        amountMinor: -8_990,
        category: 'eating_out'
    },
    { slug: 'delivery-2', account: 'nubank-card', day: 19, description: 'RAPPI *PEDIDO', amountMinor: -6_450, category: 'eating_out' },
    {
        slug: 'restaurant',
        account: 'nubank-card',
        day: 22,
        description: 'RESTAURANTE COCO BAMBU',
        amountMinor: -229_560,
        category: 'eating_out',
        providerCategoryId: PLUGGY_EATING_OUT
    },
    { slug: 'ride', account: 'nubank-card', day: 9, description: 'UBER *TRIP', amountMinor: -3_250, category: 'transport' },
    { slug: 'fuel', account: 'nubank-card', day: 18, description: 'SHELL BOX POSTO', amountMinor: -25_000, category: 'transport' },
    { slug: 'ride-2', account: 'nubank-card', day: 23, description: '99APP *CORRIDA', amountMinor: -101_750, category: 'transport' },
    { slug: 'cinema', account: 'nubank-card', day: 25, description: 'CINEMARK SHOPPING', amountMinor: -9_600, category: 'leisure' },
    { slug: 'tickets', account: 'nubank-card', day: 27, description: 'INGRESSO COM', amountMinor: -180_400, category: 'leisure' },
    { slug: 'amazon', account: 'nubank-card', day: 11, description: 'AMAZON MARKETPLACE', amountMinor: -38_900, category: 'shopping' },
    { slug: 'mercadolivre', account: 'nubank-card', day: 24, description: 'MERCADOLIVRE', amountMinor: -196_100, category: 'shopping' },
    {
        slug: 'pix-1',
        account: 'itau-checking',
        day: 14,
        description: 'Pix enviado · Maria Souza',
        amountMinor: -35_000,
        category: null,
        providerCategoryId: PLUGGY_PIX_TO_THIRD_PARTY,
        counterpartyName: 'Maria Souza',
        counterpartyDocument: SYNTHETIC_DOCUMENT
    },
    {
        slug: 'pix-2',
        account: 'itau-checking',
        day: 28,
        description: 'Pix enviado · Maria Souza',
        amountMinor: -45_000,
        category: null,
        providerCategoryId: PLUGGY_PIX_TO_THIRD_PARTY,
        counterpartyName: 'Maria Souza',
        counterpartyDocument: SYNTHETIC_DOCUMENT
    }
];

const CURRENT_ENTRIES: readonly EntrySpec[] = [
    { slug: 'netflix', account: 'nubank-card', day: 1, description: 'NETFLIX.COM', amountMinor: -5_590, category: 'subscriptions' },
    { slug: 'ride', account: 'nubank-card', day: 1, description: 'UBER *TRIP', amountMinor: -1_840, category: 'transport' }
];

export const HISTORY_MONTH_OFFSETS: readonly number[] = [-4, -3, -2];

function materialize(month: string, specs: readonly EntrySpec[]): DatasetTransaction[] {
    return specs.map((spec: EntrySpec): DatasetTransaction => ({
        key: `${month}:${spec.account}:${spec.slug}`,
        accountKey: spec.account,
        date: dateInMonth(month, spec.day),
        month,
        description: spec.description,
        amountMinor: spec.amountMinor,
        counterpartyName: spec.counterpartyName ?? null,
        counterpartyDocument: spec.counterpartyDocument ?? null,
        providerCategoryId: spec.providerCategoryId ?? null,
        expectedCategory: spec.category
    }));
}

function compareTransactions(left: DatasetTransaction, right: DatasetTransaction): number {
    if (left.date !== right.date) {
        return left.date < right.date ? -1 : 1;
    }
    return left.key < right.key ? -1 : 1;
}

export function buildSpendingDataset(today: string): SpendingDataset {
    const currentMonth: string = monthOf(today);
    const closedMonth: string = addMonths(currentMonth, -1);
    const historyMonths: string[] = HISTORY_MONTH_OFFSETS.map((offset: number): string => addMonths(currentMonth, offset));
    const transactions: DatasetTransaction[] = [
        ...historyMonths.flatMap((month: string): DatasetTransaction[] =>
            materialize(month, [...FIXED_AND_TRANSFERS, ...HISTORY_VARIABLE])
        ),
        ...materialize(closedMonth, [...FIXED_AND_TRANSFERS, ...CLOSED_VARIABLE]),
        ...materialize(currentMonth, CURRENT_ENTRIES)
    ];
    return { currentMonth, closedMonth, historyMonths, accounts: DATASET_ACCOUNTS, transactions: transactions.sort(compareTransactions) };
}
