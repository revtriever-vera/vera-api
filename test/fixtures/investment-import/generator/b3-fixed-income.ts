import { curveUnitPrice, RateSpec } from './fixed-income-pricing';
import { brDate, money } from './report-format';
import { Cell, SheetTable } from './sheet.types';
import { REFERENCE_DATE, SYNTHETIC_BROKER, SYNTHETIC_ISSUER } from './synthetic-identity';

export interface FixedIncomeCase {
    readonly code: string;
    readonly product: string;
    readonly indexer: string | null;
    readonly rate: RateSpec | null;
    readonly issueDate: string;
    readonly dueDate: string;
    readonly quantity: number;
    readonly unavailableReason: string | null;
    readonly curveVisible: boolean;
    readonly givenCurvePrice: number | null;
    readonly mtmFactor: number;
}

export interface FixedIncomeExpectation {
    readonly code: string;
    readonly indexer: string | null;
    readonly rate: RateSpec | null;
    readonly issueDate: string;
    readonly dueDate: string;
    readonly referenceDate: string;
    readonly curveUnitPrice: number | null;
}

export const FIXED_INCOME_CASES: readonly FixedIncomeCase[] = [
    {
        code: 'CDB-EX-POS112',
        product: 'CDB - CDB EXEMPLO 112% CDI',
        indexer: 'DI',
        rate: { kind: 'cdi-percent', percent: 112 },
        issueDate: '2024-03-15',
        dueDate: '2028-03-15',
        quantity: 10,
        unavailableReason: null,
        curveVisible: true,
        givenCurvePrice: null,
        mtmFactor: 1.004
    },
    {
        code: 'LCA-EX-IPCA65',
        product: 'LCA - LCA EXEMPLO IPCA + 6,5%',
        indexer: 'IPCA',
        rate: { kind: 'ipca-spread', annualPercent: 6.5 },
        issueDate: '2023-08-10',
        dueDate: '2029-08-10',
        quantity: 5,
        unavailableReason: null,
        curveVisible: true,
        givenCurvePrice: null,
        mtmFactor: 0.997
    },
    {
        code: 'CDB-EX-PRE123',
        product: 'CDB - CDB EXEMPLO PRE 12,3% A.A.',
        indexer: 'PRE',
        rate: { kind: 'pre', annualPercent: 12.3 },
        issueDate: '2025-01-20',
        dueDate: '2027-01-20',
        quantity: 8,
        unavailableReason: null,
        curveVisible: true,
        givenCurvePrice: null,
        mtmFactor: 1.002
    },
    {
        code: 'CDB-EX-CAREN',
        product: 'CDB - CDB EXEMPLO 100% CDI COM CARENCIA',
        indexer: 'DI',
        rate: { kind: 'cdi-percent', percent: 100 },
        issueDate: '2026-05-04',
        dueDate: '2028-05-04',
        quantity: 4,
        unavailableReason: 'Carência',
        curveVisible: true,
        givenCurvePrice: null,
        mtmFactor: 1
    },
    {
        code: 'DEB-EX-JUROS',
        product: 'DEB - DEBENTURE EXEMPLO (JUROS SEMESTRAIS)',
        indexer: 'IPCA',
        rate: { kind: 'ipca-spread', annualPercent: 7.1 },
        issueDate: '2023-02-15',
        dueDate: '2032-11-15',
        quantity: 12,
        unavailableReason: null,
        curveVisible: true,
        givenCurvePrice: null,
        mtmFactor: 0.985
    },
    {
        code: 'CDB-EX-APLIC',
        product: 'CDB - CDB EXEMPLO APLICACAO TARDIA',
        indexer: 'DI',
        rate: { kind: 'cdi-percent', percent: 105 },
        issueDate: '2024-02-01',
        dueDate: '2027-02-01',
        quantity: 6,
        unavailableReason: null,
        curveVisible: true,
        givenCurvePrice: null,
        mtmFactor: 1.001
    },
    {
        code: 'CDB-EX-SEMIDX',
        product: 'CDB - CDB EXEMPLO SEM INDEXADOR',
        indexer: null,
        rate: null,
        issueDate: '2025-06-02',
        dueDate: '2027-06-02',
        quantity: 3,
        unavailableReason: null,
        curveVisible: true,
        givenCurvePrice: 1043.17,
        mtmFactor: 1
    },
    {
        code: 'CDB-EX-SEMCURVA',
        product: 'CDB - CDB EXEMPLO SEM CURVA',
        indexer: 'DI',
        rate: { kind: 'cdi-percent', percent: 110 },
        issueDate: '2025-09-01',
        dueDate: '2027-09-01',
        quantity: 7,
        unavailableReason: null,
        curveVisible: false,
        givenCurvePrice: null,
        mtmFactor: 1.003
    }
];

const HEADERS: readonly string[] = [
    'Produto',
    'Instituição',
    'Emissor',
    'Código',
    'Indexador',
    'Tipo de regime',
    'Data de Emissão',
    'Vencimento',
    'Quantidade',
    'Quantidade Disponível',
    'Quantidade Indisponível',
    'Motivo',
    'Preço Atualizado MTM',
    'Valor Atualizado MTM',
    'Preço Atualizado CURVA',
    'Valor Atualizado CURVA',
    'Preço Atualizado FECHAMENTO',
    'Valor Atualizado FECHAMENTO'
];

function underlyingCurvePrice(item: FixedIncomeCase): number | null {
    if (item.givenCurvePrice !== null) {
        return item.givenCurvePrice;
    }
    return item.rate === null ? null : curveUnitPrice(item.rate, item.issueDate, REFERENCE_DATE);
}

function pricePair(unitPrice: number | null, quantity: number): Cell[] {
    return unitPrice === null ? [null, null] : [unitPrice, money(unitPrice * quantity)];
}

function fixedIncomeRow(item: FixedIncomeCase): Cell[] {
    const curve: number | null = underlyingCurvePrice(item);
    const mtm: number | null = curve === null ? null : money(curve * item.mtmFactor);
    const unavailable: number = item.unavailableReason === null ? 0 : item.quantity;
    return [
        item.product,
        SYNTHETIC_BROKER,
        SYNTHETIC_ISSUER,
        item.code,
        item.indexer,
        'Normal',
        brDate(item.issueDate),
        brDate(item.dueDate),
        item.quantity,
        item.quantity - unavailable,
        unavailable,
        item.unavailableReason,
        ...pricePair(mtm, item.quantity),
        ...pricePair(item.curveVisible ? curve : null, item.quantity),
        ...pricePair(mtm, item.quantity)
    ];
}

export function buildFixedIncomeSheet(): SheetTable {
    return { name: 'Renda Fixa', slug: 'renda-fixa', headers: HEADERS, rows: FIXED_INCOME_CASES.map(fixedIncomeRow) };
}

export function buildFixedIncomeExpectations(): FixedIncomeExpectation[] {
    return FIXED_INCOME_CASES.map((item: FixedIncomeCase): FixedIncomeExpectation => ({
        code: item.code,
        indexer: item.indexer,
        rate: item.rate,
        issueDate: item.issueDate,
        dueDate: item.dueDate,
        referenceDate: REFERENCE_DATE,
        curveUnitPrice: item.curveVisible ? underlyingCurvePrice(item) : null
    }));
}
