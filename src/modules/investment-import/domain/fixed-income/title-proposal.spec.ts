import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seriesUntil } from '../../../../../test/support/reference-curve-series';
import { readB3Report } from '../b3/b3-file.reader';
import { ParsedInvestmentStatement } from '../investment-statement.types';
import { FIXED_INCOME_REASONS, FIXED_INCOME_STATUSES, StoredFixedIncome } from './fixed-income-import.types';
import {
    applicationDatesOf,
    asDuplicate,
    countByProposalStatus,
    defaultPositionDate,
    kindOfProduct,
    paymentEventCodesOf,
    probeOf,
    proposalsOf
} from './title-proposal';

const GENERATED: string = join(__dirname, '../../../../../test/fixtures/investment-import/generated/b3');

function fixture(name: string): Uint8Array {
    return new Uint8Array(readFileSync(join(GENERATED, name)));
}

async function statementOf(): Promise<ParsedInvestmentStatement> {
    const position: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao-renda-fixa.csv'));
    const movements: ParsedInvestmentStatement = await readB3Report(fixture('b3-movimentacao.csv'));
    return { ...position, ignored: [...position.ignored, ...movements.ignored] };
}

async function proposals(issuePrice: string | null = '1000'): Promise<Map<string, StoredFixedIncome>> {
    const read: ParsedInvestmentStatement = await statementOf();
    const statement: ParsedInvestmentStatement = {
        ...read,
        fixedIncome: read.fixedIncome.map((entry) => ({ ...entry, unitPrices: { ...entry.unitPrices, issue: issuePrice } }))
    };
    const list: StoredFixedIncome[] = proposalsOf(statement, {
        positionDate: '2026-10-30',
        series: seriesUntil('2026-10-29', '2026-09'),
        paymentEventCodes: paymentEventCodesOf(statement),
        applicationDates: applicationDatesOf(statement),
        matchIssuer: (name: string | null): string | null => (name === 'BANCO EXEMPLO' ? 'banco-exemplo' : null)
    });
    return new Map(list.map((entry: StoredFixedIncome): [string, StoredFixedIncome] => [entry.product.split(' - ')[1] ?? '', entry]));
}

function byName(all: Map<string, StoredFixedIncome>, fragment: string): StoredFixedIncome {
    const found: StoredFixedIncome | undefined = [...all.values()].find((entry: StoredFixedIncome): boolean =>
        entry.product.includes(fragment)
    );
    if (found === undefined) {
        throw new Error(`missing ${fragment}`);
    }
    return found;
}

describe('proposalsOf sobre a Posição da B3', () => {
    it('propõe o título pronto quando a taxa sai da curva', async () => {
        const all: Map<string, StoredFixedIncome> = await proposals();

        expect(byName(all, '112% CDI')).toMatchObject({
            lineId: 'F1',
            kind: 'cdb',
            indexer: 'cdi_percent',
            rateBps: 11200,
            appliedMinor: 1000000,
            appliedAt: '2024-03-15',
            maturityDate: '2028-03-15',
            issuerId: 'banco-exemplo',
            status: 'inferred',
            reason: null,
            suggestion: 'Achamos: CDB BANCO EXEMPLO, 112% do CDI, vence em 03/2028. Confirmar?'
        });
        expect(byName(all, 'IPCA')).toMatchObject({ kind: 'lca', indexer: 'ipca_plus', status: 'inferred' });
        expect(byName(all, 'PRE')).toMatchObject({ indexer: 'prefixed', rateBps: 1230, status: 'inferred' });
    });

    it('sem preço de emissão na planilha assume a face e avisa antes de confirmar', async () => {
        const all: Map<string, StoredFixedIncome> = await proposals(null);

        expect(byName(all, '112% CDI')).toMatchObject({
            status: 'check',
            reason: 'assumed_face_price',
            rateBps: 11200,
            appliedMinor: 1000000
        });
        expect(byName(all, '112% CDI').suggestion).toContain('valor de face');
        expect(byName(all, 'CARENCIA').reason).toBe('grace_period');
    });

    it('marca como check a carência e a data de aplicação diferente da emissão', async () => {
        const all: Map<string, StoredFixedIncome> = await proposals();

        expect(byName(all, 'CARENCIA')).toMatchObject({ status: 'check', reason: 'grace_period', rateBps: 10000 });
        expect(byName(all, 'APLICACAO TARDIA')).toMatchObject({ status: 'check', reason: 'application_date_differs', rateBps: 10500 });
        expect(byName(all, 'APLICACAO TARDIA').suggestion).toContain('Atenção');
    });

    it('cai no completar quando há pagamento de juros ou amortização', async () => {
        const all: Map<string, StoredFixedIncome> = await proposals();

        expect(byName(all, 'DEBENTURE')).toMatchObject({
            kind: 'debenture',
            status: 'needs_input',
            reason: 'payment_event',
            rateBps: null,
            indexer: 'ipca_plus'
        });
        expect(byName(all, 'DEBENTURE').suggestion).toMatch(/^Complete o título/);
    });

    it('cai no completar sem indexador ou sem CURVA', async () => {
        const all: Map<string, StoredFixedIncome> = await proposals();

        expect(byName(all, 'SEM INDEXADOR')).toMatchObject({ status: 'needs_input', reason: 'missing_data', indexer: null });
        expect(byName(all, 'SEM CURVA')).toMatchObject({ status: 'needs_input', reason: 'missing_data', indexer: 'cdi_percent' });
    });

    it('conta por status sem expor taxa, emissor ou valor', async () => {
        const all: Map<string, StoredFixedIncome> = await proposals();

        expect(countByProposalStatus([...all.values()])).toEqual({ inferred: 3, check: 2, needs_input: 3 });
    });
});

describe('helpers da proposta', () => {
    it('reconhece o tipo pelo prefixo do produto', () => {
        expect(kindOfProduct('LCI - LCI EXEMPLO')).toBe('lci');
        expect(kindOfProduct('DEB - DEBENTURE')).toBe('debenture');
        expect(kindOfProduct('FUNDO XYZ')).toBeNull();
        expect(kindOfProduct('XYZ - ALGO')).toBeNull();
    });

    it('a posição de fim de semana cai na sexta anterior', () => {
        expect(defaultPositionDate('2026-11-25')).toBe('2026-11-24');
        expect(defaultPositionDate('2026-11-23')).toBe('2026-11-20');
        expect(defaultPositionDate('2026-11-22')).toBe('2026-11-20');
    });

    it('marca o duplicado e só sonda título revisável', async () => {
        const all: Map<string, StoredFixedIncome> = await proposals();
        const inferred: StoredFixedIncome = byName(all, '112% CDI');

        expect(probeOf(inferred)).toMatchObject({ indexer: 'cdi_percent', maturityDate: '2028-03-15', appliedMinor: 1000000 });
        expect(probeOf(byName(all, 'SEM CURVA'))).toBeNull();
        expect(asDuplicate(inferred)).toMatchObject({
            status: FIXED_INCOME_STATUSES.duplicate,
            reason: FIXED_INCOME_REASONS.duplicate
        });
        expect(asDuplicate(inferred).suggestion).toMatch(/^Já existe um título igual/);
    });
});
