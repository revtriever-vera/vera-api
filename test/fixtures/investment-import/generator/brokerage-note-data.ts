export type NoteLayout = 'sinacor' | 'sinacor-reordered' | 'own' | 'two-pages' | 'scanned';
export type AssetKindName = 'stock' | 'fii' | 'etf' | 'bdr';

export interface NoteTrade {
    readonly side: 'buy' | 'sell';
    readonly market: string;
    readonly spec: string;
    readonly printedCode: string | null;
    readonly ticker: string | null;
    readonly quantity: number;
    readonly priceCents: number;
    readonly dayTrade?: boolean;
}

export interface NoteSpec {
    readonly number: string;
    readonly date: string;
    readonly trades: readonly NoteTrade[];
    readonly brokerageCents: number;
    readonly printedTotalCents?: number;
}

export interface NoteDocument {
    readonly id: string;
    readonly description: string;
    readonly layout: NoteLayout;
    readonly poisoned?: boolean;
    readonly notes: readonly NoteSpec[];
}

export interface CatalogEntry {
    readonly symbol: string;
    readonly name: string;
    readonly kind: AssetKindName;
}

export interface NoteFees {
    readonly settlementCents: number;
    readonly exchangeCents: number;
    readonly brokerageCents: number;
    readonly issCents: number;
    readonly irrfCents: number;
}

export interface NoteTotals {
    readonly volumeCents: number;
    readonly fees: NoteFees;
    readonly netCents: number;
}

export const SPOT_MARKET: string = 'VISTA';
export const FRACTIONAL_MARKET: string = 'FRACIONARIO';
export const OPTION_MARKET: string = 'OPCAO DE COMPRA';

export const NOTE_CATALOG: readonly CatalogEntry[] = [
    { symbol: 'PETR3', name: 'PETROLEO BRASILEIRO S.A. PETROBRAS', kind: 'stock' },
    { symbol: 'PETR4', name: 'PETROLEO BRASILEIRO S.A. PETROBRAS', kind: 'stock' },
    { symbol: 'BRDT3', name: 'PETROBRAS DISTRIBUIDORA S.A.', kind: 'stock' },
    { symbol: 'VALE3', name: 'VALE S.A.', kind: 'stock' },
    { symbol: 'ITUB3', name: 'ITAU UNIBANCO HOLDING S.A.', kind: 'stock' },
    { symbol: 'ITUB4', name: 'ITAU UNIBANCO HOLDING S.A.', kind: 'stock' },
    { symbol: 'BBDC4', name: 'BANCO BRADESCO S.A.', kind: 'stock' },
    { symbol: 'WEGE3', name: 'WEG S.A.', kind: 'stock' },
    { symbol: 'HGLG11', name: 'CSHG LOGISTICA FUNDO DE INVESTIMENTO IMOBILIARIO', kind: 'fii' },
    { symbol: 'XPML11', name: 'XP MALLS FUNDO DE INVESTIMENTO IMOBILIARIO', kind: 'fii' },
    { symbol: 'BOVA11', name: 'ISHARES IBOVESPA FUNDO DE INDICE', kind: 'etf' },
    { symbol: 'AAPL34', name: 'APPLE INC', kind: 'bdr' }
];

const SETTLEMENT_RATE: number = 0.000275;
const EXCHANGE_RATE: number = 0.0000325;
const ISS_RATE: number = 0.05;
const IRRF_RATE: number = 0.00005;

export function grossCentsOf(trade: NoteTrade): number {
    return trade.quantity * trade.priceCents;
}

export function totalsOf(note: NoteSpec): NoteTotals {
    const volumeCents: number = note.trades.reduce((sum: number, trade: NoteTrade): number => sum + grossCentsOf(trade), 0);
    const sellCents: number = note.trades
        .filter((trade: NoteTrade): boolean => trade.side === 'sell')
        .reduce((sum: number, trade: NoteTrade): number => sum + grossCentsOf(trade), 0);
    const buyCents: number = volumeCents - sellCents;
    const fees: NoteFees = {
        settlementCents: Math.round(volumeCents * SETTLEMENT_RATE),
        exchangeCents: Math.round(volumeCents * EXCHANGE_RATE),
        brokerageCents: note.brokerageCents,
        issCents: Math.round(note.brokerageCents * ISS_RATE),
        irrfCents: Math.round(sellCents * IRRF_RATE)
    };
    const costs: number = fees.settlementCents + fees.exchangeCents + fees.brokerageCents + fees.issCents;
    return { volumeCents, fees, netCents: sellCents - buyCents - costs - fees.irrfCents };
}

function buy(spec: string, quantity: number, priceCents: number, ticker: string | null, extra: Partial<NoteTrade> = {}): NoteTrade {
    return { side: 'buy', market: SPOT_MARKET, spec, printedCode: null, ticker, quantity, priceCents, ...extra };
}

function sell(spec: string, quantity: number, priceCents: number, ticker: string | null, extra: Partial<NoteTrade> = {}): NoteTrade {
    return { side: 'sell', market: SPOT_MARKET, spec, printedCode: null, ticker, quantity, priceCents, ...extra };
}

const PETROBRAS: string = 'PETROBRAS PN N2';
const VALE: string = 'VALE ON NM';
const ITAU: string = 'ITAU UNIBANCO PN N1';

export const NOTE_DOCUMENTS: readonly NoteDocument[] = [
    {
        id: 'nota-sinacor-classico',
        description: 'Uma nota no padrão SINACOR, duas compras, só a especificação do título',
        layout: 'sinacor',
        notes: [
            {
                number: '1010001',
                date: '2026-11-03',
                brokerageCents: 490,
                trades: [buy(PETROBRAS, 100, 3850, 'PETR4'), buy(VALE, 50, 6210, 'VALE3')]
            }
        ]
    },
    {
        id: 'nota-sinacor-invertido',
        description: 'SINACOR com o resumo financeiro antes dos negócios, uma venda e uma compra',
        layout: 'sinacor-reordered',
        notes: [
            {
                number: '1010002',
                date: '2026-11-04',
                brokerageCents: 490,
                trades: [sell(ITAU, 200, 3345, 'ITUB4'), buy('BANCO BRADESCO PN EJ N1', 300, 1420, 'BBDC4')]
            }
        ]
    },
    {
        id: 'nota-layout-proprio',
        description: 'Layout próprio de corretora, com coluna de código de negociação',
        layout: 'own',
        notes: [
            {
                number: '2020003',
                date: '2026-11-05',
                brokerageCents: 0,
                trades: [
                    buy('WEG ON NM', 80, 4230, 'WEGE3', { printedCode: 'WEGE3' }),
                    sell(PETROBRAS, 40, 3890, 'PETR4', { printedCode: 'PETR4' })
                ]
            }
        ]
    },
    {
        id: 'nota-duas-paginas',
        description: 'Nota SINACOR de duas páginas: negócios continuam na página 2, onde ficam os resumos',
        layout: 'two-pages',
        notes: [
            {
                number: '1010004',
                date: '2026-11-06',
                brokerageCents: 980,
                trades: [
                    buy(PETROBRAS, 100, 3850, 'PETR4'),
                    buy(VALE, 50, 6210, 'VALE3'),
                    buy(ITAU, 120, 3340, 'ITUB4'),
                    sell('WEG ON NM', 30, 4300, 'WEGE3'),
                    buy('BANCO BRADESCO PN EJ N1', 200, 1415, 'BBDC4'),
                    sell(VALE, 20, 6250, 'VALE3')
                ]
            }
        ]
    },
    {
        id: 'nota-escaneada',
        description: 'Nota SINACOR escaneada: PDF só com imagem, sem camada de texto',
        layout: 'scanned',
        notes: [
            {
                number: '1010005',
                date: '2026-11-09',
                brokerageCents: 490,
                trades: [buy(PETROBRAS, 100, 3850, 'PETR4'), sell(VALE, 50, 6210, 'VALE3')]
            }
        ]
    },
    {
        id: 'nota-varias-notas',
        description: 'Duas notas de pregões diferentes no mesmo PDF',
        layout: 'sinacor',
        notes: [
            { number: '1010006', date: '2026-11-10', brokerageCents: 490, trades: [buy(PETROBRAS, 100, 3850, 'PETR4')] },
            {
                number: '1010007',
                date: '2026-11-11',
                brokerageCents: 490,
                trades: [buy(VALE, 50, 6210, 'VALE3'), sell(ITAU, 100, 3350, 'ITUB4')]
            }
        ]
    },
    {
        id: 'nota-day-trade',
        description: 'Day trade: compra e venda da mesma ação no mesmo pregão (marcadas D) e uma compra normal',
        layout: 'sinacor',
        notes: [
            {
                number: '1010008',
                date: '2026-11-12',
                brokerageCents: 490,
                trades: [
                    buy(VALE, 100, 6100, 'VALE3', { dayTrade: true }),
                    sell(VALE, 100, 6140, 'VALE3', { dayTrade: true }),
                    buy(PETROBRAS, 10, 3860, 'PETR4')
                ]
            }
        ]
    },
    {
        id: 'nota-fii',
        description: 'Compra de cota de FII (especificação com CI)',
        layout: 'sinacor',
        notes: [{ number: '1010009', date: '2026-11-13', brokerageCents: 490, trades: [buy('FII CSHG LOG CI', 10, 15820, 'HGLG11')] }]
    },
    {
        id: 'nota-etf',
        description: 'Compra de cota de ETF (especificação com CI)',
        layout: 'sinacor',
        notes: [{ number: '1010010', date: '2026-11-16', brokerageCents: 490, trades: [buy('ISHARES IBOVESPA CI', 20, 12890, 'BOVA11')] }]
    },
    {
        id: 'nota-bdr',
        description: 'Compra de BDR (especificação com DRN)',
        layout: 'sinacor',
        notes: [{ number: '1010011', date: '2026-11-17', brokerageCents: 490, trades: [buy('APPLE DRN', 50, 5220, 'AAPL34')] }]
    },
    {
        id: 'nota-opcao',
        description: 'Nota com opção: a linha da opção é ignorada com o motivo, a ação entra',
        layout: 'sinacor',
        notes: [
            {
                number: '1010012',
                date: '2026-11-18',
                brokerageCents: 490,
                trades: [
                    buy(PETROBRAS, 100, 3850, 'PETR4'),
                    { ...buy('PETRK400 PETROBRAS PN N2 E 40,00', 1000, 85, null), market: OPTION_MARKET }
                ]
            }
        ]
    },
    {
        id: 'nota-total-nao-bate',
        description: 'O "Valor das operações" impresso não bate com a soma dos negócios',
        layout: 'sinacor',
        notes: [
            {
                number: '1010013',
                date: '2026-11-19',
                brokerageCents: 490,
                printedTotalCents: 1_000_000,
                trades: [buy(PETROBRAS, 100, 3850, 'PETR4'), buy(VALE, 50, 6210, 'VALE3')]
            }
        ]
    },
    {
        id: 'nota-envenenada',
        description: 'Cabeçalho cheio de dado pessoal (nome, CPF, código de cliente, conta, agência) que não pode chegar ao modelo',
        layout: 'sinacor',
        poisoned: true,
        notes: [
            {
                number: '1010014',
                date: '2026-11-20',
                brokerageCents: 490,
                trades: [buy(PETROBRAS, 100, 3850, 'PETR4'), buy(VALE, 50, 6210, 'VALE3')]
            }
        ]
    }
];
