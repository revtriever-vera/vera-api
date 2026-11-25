import { describe, expect, it } from 'vitest';
import { ParsedInvestmentStatement, ParsedOperation } from '../investment-statement.types';
import { specsOfModelAnswers, statementOfModelAnswers } from './model-statement';

const TODAY: string = '2026-11-25';

function trade(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        side: 'buy',
        code: 'PETR4',
        securitySpec: 'PETROBRAS PN N2',
        market: 'VISTA',
        quantity: '100',
        unitPrice: '38.50',
        grossMinor: 385000,
        ...extra
    };
}

function note(trades: Record<string, unknown>[], extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        number: '1010001',
        tradeDate: '2026-11-03',
        broker: 'CORRETORA EXEMPLO',
        trades,
        operationsTotalMinor: trades.reduce((sum: number, item: Record<string, unknown>): number => sum + Number(item['grossMinor']), 0),
        fees: { settlementMinor: 100, exchangeMinor: 20, brokerageMinor: 490, issMinor: 25, irrfMinor: 0, otherMinor: 0 },
        ...extra
    };
}

function read(notes: Record<string, unknown>[], tickersBySpec: Map<string, string> = new Map()): ParsedInvestmentStatement {
    const answer: string = JSON.stringify({ documentType: 'note', currency: 'BRL', operations: [], notes });
    return statementOfModelAnswers([answer], { labels: ['text'], unreadPages: [], today: TODAY, tickersBySpec });
}

function feesOf(statement: ParsedInvestmentStatement): number[] {
    return statement.operations.map((operation: ParsedOperation): number => operation.feesMinor);
}

describe('nota de corretagem lida pelo modelo', () => {
    it('rateia as taxas pelo volume de cada linha e a soma fecha no centavo', () => {
        const statement: ParsedInvestmentStatement = read([
            note([trade({ grossMinor: 385000 }), trade({ code: 'VALE3', quantity: '50', unitPrice: '62.10', grossMinor: 310500 })])
        ]);

        expect(feesOf(statement)).toEqual([352, 283]);
        expect(feesOf(statement).reduce((sum: number, fee: number): number => sum + fee, 0)).toBe(635);
    });

    it('IRRF não entra no custo da linha, mas entra na conferência do líquido', () => {
        const withIrrf: Record<string, unknown> = note([trade({ side: 'sell' })], {
            fees: { settlementMinor: 100, exchangeMinor: 0, brokerageMinor: 0, issMinor: 0, irrfMinor: 20 },
            netMinor: 385000 - 100 - 20
        });
        const statement: ParsedInvestmentStatement = read([withIrrf]);

        expect(feesOf(statement)).toEqual([100]);
        expect(statement.operations[0]?.check).toBeUndefined();
        expect(statement.notes).toEqual([]);
    });

    it('compra vira credit e venda vira debit, no preço e valor impressos', () => {
        const statement: ParsedInvestmentStatement = read([note([trade(), trade({ side: 'sell' })])]);

        expect(statement.operations.map((operation: ParsedOperation): string => `${operation.kind}:${operation.direction}`)).toEqual([
            'buy:credit',
            'sell:debit'
        ]);
        expect(statement.operations[0]).toMatchObject({ unitPrice: '38.50', grossMinor: 385000, currency: 'BRL', tradeDate: '2026-11-03' });
    });

    it('valor das operações que não bate marca todas as linhas da nota com total_mismatch e nunca descarta', () => {
        const statement: ParsedInvestmentStatement = read([note([trade(), trade({ code: 'VALE3' })], { operationsTotalMinor: 1 })]);

        expect(statement.operations).toHaveLength(2);
        expect(statement.operations.map((operation: ParsedOperation): string | undefined => operation.check)).toEqual([
            'total_mismatch',
            'total_mismatch'
        ]);
        expect(statement.notes).toEqual([{ code: 'note_total_mismatch', count: 1 }]);
    });

    it('líquido que não bate com negócios menos taxas marca net_mismatch', () => {
        const statement: ParsedInvestmentStatement = read([note([trade()], { netMinor: -999999 })]);

        expect(statement.operations[0]?.check).toBe('net_mismatch');
        expect(statement.notes).toEqual([{ code: 'note_net_mismatch', count: 1 }]);
    });

    it('líquido certo, com débito negativo, passa', () => {
        const statement: ParsedInvestmentStatement = read([note([trade()], { netMinor: -(385000 + 635) })]);

        expect(statement.operations[0]?.check).toBeUndefined();
        expect(statement.notes).toEqual([]);
    });

    it('a nota mal conferida de um PDF não contamina a outra', () => {
        const statement: ParsedInvestmentStatement = read([note([trade()], { operationsTotalMinor: 5 }), note([trade({ code: 'VALE3' })])]);

        expect(statement.operations.map((operation: ParsedOperation): string | undefined => operation.check)).toEqual([
            'total_mismatch',
            undefined
        ]);
        expect(statement.operations.map((operation: ParsedOperation): number => operation.line)).toEqual([1, 2]);
    });

    it('opção e termo viram linha ignorada com o motivo, e a parte da taxa dela sai do custo', () => {
        const statement: ParsedInvestmentStatement = read([
            note([
                trade(),
                trade({ code: null, securitySpec: 'PETRK400 PETROBRAS PN N2 E 40,00', market: 'OPCAO DE COMPRA', grossMinor: 385000 })
            ]),
            note([trade({ market: 'TERMO' })])
        ]);

        expect(statement.operations).toHaveLength(1);
        expect(statement.operations[0]?.feesMinor).toBe(318);
        expect(statement.ignored.map((line) => ({ reason: line.reason, description: line.description }))).toEqual([
            { reason: 'unsupported_market', description: 'PETRK400 PETROBRAS PN N2 E 40,00' },
            { reason: 'unsupported_market', description: 'PETROBRAS PN N2' }
        ]);
    });

    it('código de negociação impresso vale mais que a especificação; sem código usa o catálogo', () => {
        const spec: string = 'PETROBRAS PN N2';
        const statement: ParsedInvestmentStatement = read(
            [note([trade({ code: 'VALE3' }), trade({ code: null }), trade({ code: null, securitySpec: 'EMPRESA SEM CATALOGO ON NM' })])],
            new Map([['PETROBRAS PN N2', 'PETR4']])
        );

        expect(spec).toBe('PETROBRAS PN N2');
        expect(statement.operations.map((operation: ParsedOperation): string => operation.ticker)).toEqual([
            'VALE3',
            'PETR4',
            'EMPRESASEMCATALOGOONNM'
        ]);
        expect(statement.operations[2]?.productName).toBe('EMPRESA SEM CATALOGO ON NM');
    });

    it('código fracionário perde o F', () => {
        const statement: ParsedInvestmentStatement = read([note([trade({ code: 'PETR4F', market: 'FRACIONARIO' })])]);

        expect(statement.operations[0]?.ticker).toBe('PETR4');
    });

    it('linha ilegível é rejeitada e a conferência de totais não acusa a nota inteira', () => {
        const statement: ParsedInvestmentStatement = read([
            note([trade(), { side: 'buy', code: 'VALE3', quantity: 'abc' }], { operationsTotalMinor: 999 })
        ]);

        expect(statement.operations).toHaveLength(1);
        expect(statement.operations[0]?.check).toBeUndefined();
        expect(statement.rejected).toEqual([{ sheet: 'text', line: 2, reason: 'invalid_quantity' }]);
    });

    it('linha sem código e sem especificação é rejeitada como ativo ausente', () => {
        const statement: ParsedInvestmentStatement = read([note([trade({ code: null, securitySpec: null })])]);

        expect(statement.rejected[0]?.reason).toBe('missing_asset');
    });

    it('data do pregão futura marca date_out_of_range', () => {
        const statement: ParsedInvestmentStatement = read([note([trade()], { tradeDate: '2027-01-02' })]);

        expect(statement.operations[0]?.check).toBe('date_out_of_range');
    });

    it('lista as especificações sem código para o catálogo, sem repetir', () => {
        const answer: string = JSON.stringify({
            documentType: 'note',
            currency: 'BRL',
            operations: [],
            notes: [note([trade({ code: null }), trade({ code: null }), trade({ code: 'VALE3', securitySpec: 'VALE ON NM' })])]
        });

        expect(specsOfModelAnswers([answer])).toEqual(['PETROBRAS PN N2']);
    });
});
