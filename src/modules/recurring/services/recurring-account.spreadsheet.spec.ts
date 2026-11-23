import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringAccountSpreadsheet } from './recurring-account.spreadsheet';

function record(over: Record<string, unknown>): Record<string, unknown> {
    return {
        name: 'Netflix',
        accountId: 'a-real',
        cadence: 'annual',
        valueMode: 'variable',
        kind: 'bill',
        status: 'stopped',
        typicalAmountMinor: 120000,
        expectedDay: 12,
        ...over
    };
}

function build(locale: 'pt-BR' | 'en'): RecurringAccountSpreadsheet {
    return new RecurringAccountSpreadsheet(
        {
            list: vi
                .fn()
                .mockResolvedValue([
                    record({}),
                    record({ name: '=cmd()', accountId: 'a-real' }),
                    record({ name: 'Exemplo', accountId: 'a-sample' })
                ])
        } as unknown as RecurringSeriesDomain,
        {
            list: vi.fn().mockResolvedValue([
                { id: 'a-real', name: 'Itaú', isSample: false },
                { id: 'a-sample', name: 'Exemplo', isSample: true }
            ])
        } as unknown as FinancialAccountService,
        { get: () => ({ locale }) } as unknown as AppContext
    );
}

async function rowsOf(spreadsheet: RecurringAccountSpreadsheet): Promise<unknown[][]> {
    const [sheet] = await spreadsheet.sheets();
    const rows: unknown[][] = [];
    for await (const row of sheet?.rows as AsyncIterable<unknown[]>) {
        rows.push(row);
    }
    return rows;
}

describe('RecurringAccountSpreadsheet', () => {
    it('uma aba com as nove colunas do card, em pt-BR, sem a série da conta de exemplo e com texto seguro', async () => {
        const spreadsheet: RecurringAccountSpreadsheet = build('pt-BR');
        const [sheet] = await spreadsheet.sheets();
        const rows: unknown[][] = await rowsOf(spreadsheet);

        expect(spreadsheet.name).toBe('recurring');
        expect(sheet?.file).toBe('assinaturas-e-contas');
        expect(sheet?.name).toBe('Assinaturas e contas');
        expect(sheet?.columns.map((column) => column.header)).toEqual([
            'Nome',
            'Tipo',
            'Cadência',
            'Dia',
            'Valor',
            'Valor fixo ou variável',
            'Situação',
            'Equivalente mensal',
            'Conta'
        ]);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual([
            'Netflix',
            'Conta',
            'Anual',
            12,
            { value: 1200, numFmt: '"R$" #,##0.00' },
            'Variável',
            'Parada',
            { value: 100, numFmt: '"R$" #,##0.00' },
            'Itaú'
        ]);
        expect(rows[1]?.[0]).toBe("'=cmd()");
    });

    it('em inglês traduz o tipo, a cadência e a situação', async () => {
        const rows: unknown[][] = await rowsOf(build('en'));

        expect([rows[0]?.[1], rows[0]?.[2], rows[0]?.[5], rows[0]?.[6]]).toEqual(['Bill', 'Yearly', 'Variable', 'Stopped']);
    });
});
