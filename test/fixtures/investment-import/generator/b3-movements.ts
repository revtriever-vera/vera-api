import { brDate, money } from './report-format';
import { Cell, SheetTable } from './sheet.types';
import { SYNTHETIC_BROKER } from './synthetic-identity';

interface Movement {
    readonly direction: 'Credito' | 'Debito';
    readonly date: string;
    readonly kind: string;
    readonly product: string;
    readonly quantity: number;
    readonly unitPrice: number | null;
}

const PETR: string = 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS';
const VALE: string = 'VALE3 - VALE S.A.';
const ITUB: string = 'ITUB4 - ITAU UNIBANCO HOLDING S.A.';
const HGLG: string = 'HGLG11 - FUNDO DE INVESTIMENTO IMOBILIARIO EXEMPLO LOGISTICA';
const SETTLEMENT: string = 'Transferência - Liquidação';
const DEBENTURE: string = 'DEB-EX-JUROS - DEBENTURE EXEMPLO (JUROS SEMESTRAIS)';
const APPLIED: string = 'CDB-EX-APLIC - CDB EXEMPLO APLICACAO TARDIA';

const MOVEMENTS: readonly Movement[] = [
    { direction: 'Credito', date: '2025-02-12', kind: SETTLEMENT, product: PETR, quantity: 200, unitPrice: 36.1 },
    {
        direction: 'Credito',
        date: '2025-05-14',
        kind: SETTLEMENT,
        product: 'BOVA11 - ETF EXEMPLO IBOVESPA',
        quantity: 50,
        unitPrice: 121.3
    },
    { direction: 'Credito', date: '2025-06-25', kind: SETTLEMENT, product: HGLG, quantity: 60, unitPrice: 152.9 },
    { direction: 'Credito', date: '2025-08-15', kind: 'Dividendo', product: ITUB, quantity: 300, unitPrice: 0.12 },
    { direction: 'Credito', date: '2025-09-19', kind: 'Juros Sobre Capital Próprio', product: VALE, quantity: 150, unitPrice: 0.62 },
    { direction: 'Credito', date: '2025-10-15', kind: 'Rendimento', product: HGLG, quantity: 60, unitPrice: 1.1 },
    { direction: 'Credito', date: '2025-11-14', kind: 'Rendimento', product: HGLG, quantity: 60, unitPrice: 1.12 },
    { direction: 'Credito', date: '2025-12-02', kind: 'Desdobro', product: ITUB, quantity: 100, unitPrice: null },
    { direction: 'Credito', date: '2026-04-10', kind: 'Bonificação em Ativos', product: PETR, quantity: 20, unitPrice: 31.5 },
    { direction: 'Credito', date: '2026-05-04', kind: 'Dividendo', product: PETR, quantity: 227, unitPrice: 0.45 },
    { direction: 'Credito', date: '2024-06-10', kind: SETTLEMENT, product: APPLIED, quantity: 6, unitPrice: 1000 },
    { direction: 'Credito', date: '2026-02-16', kind: 'Pagamento de Juros', product: DEBENTURE, quantity: 12, unitPrice: 31.42 },
    { direction: 'Debito', date: '2026-08-17', kind: 'Amortização', product: DEBENTURE, quantity: 12, unitPrice: 83.33 }
];

const HEADERS: readonly string[] = [
    'Entrada/Saída',
    'Data',
    'Movimentação',
    'Produto',
    'Instituição',
    'Quantidade',
    'Preço unitário',
    'Valor da Operação'
];

function movementRow(movement: Movement): Cell[] {
    const price: Cell = movement.unitPrice;
    const value: Cell = movement.unitPrice === null ? null : money(movement.unitPrice * movement.quantity);
    return [
        movement.direction,
        brDate(movement.date),
        movement.kind,
        movement.product,
        SYNTHETIC_BROKER,
        movement.quantity,
        price ?? '-',
        value ?? '-'
    ];
}

export function buildMovementsSheet(): SheetTable {
    return { name: 'Movimentação', slug: 'movimentacao', headers: HEADERS, rows: MOVEMENTS.map(movementRow) };
}
