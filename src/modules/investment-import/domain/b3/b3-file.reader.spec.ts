import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { FormatNotRecognizedError } from '../investment-import.errors';
import { ParsedInvestmentStatement, ParsedOperation, ParsedPositionAdjustment } from '../investment-statement.types';
import { readB3Report } from './b3-file.reader';
import { markAlreadyImported } from './b3-statement';

const GENERATED: string = join(__dirname, '../../../../../test/fixtures/investment-import/generated/b3');

function fixture(name: string): Uint8Array {
    return new Uint8Array(readFileSync(join(GENERATED, name)));
}

async function workbookBytes(sheets: Record<string, (string | number)[][]>): Promise<Uint8Array> {
    const workbook: ExcelJS.Workbook = new ExcelJS.Workbook();
    for (const [name, rows] of Object.entries(sheets)) {
        const sheet: ExcelJS.Worksheet = workbook.addWorksheet(name);
        rows.forEach((row: (string | number)[]): void => {
            sheet.addRow(row);
        });
    }
    return new Uint8Array(Buffer.from(await workbook.xlsx.writeBuffer()));
}

function operationOf(statement: ParsedInvestmentStatement, ticker: string, kind: string): ParsedOperation {
    const found: ParsedOperation | undefined = statement.operations.find(
        (operation: ParsedOperation): boolean => operation.ticker === ticker && operation.kind === kind
    );
    if (found === undefined) {
        throw new Error(`missing ${kind} ${ticker}`);
    }
    return found;
}

describe('readB3Report: Negociação', () => {
    it('lê o Excel e o CSV com o mesmo resultado', async () => {
        const fromExcel: ParsedInvestmentStatement = await readB3Report(fixture('b3-negociacao.xlsx'));
        const fromCsv: ParsedInvestmentStatement = await readB3Report(fixture('b3-negociacao.csv'));

        expect(fromExcel.reportKinds).toEqual(['negotiation']);
        expect(fromExcel.operations).toHaveLength(12);
        expect(fromExcel.operations.map((operation) => operation.matchKey)).toEqual(
            fromCsv.operations.map((operation) => operation.matchKey)
        );
        expect(fromExcel.rejected).toEqual([]);
    });

    it('devolve compra e venda com quantidade, preço e valor', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-negociacao.xlsx'));

        expect(operationOf(statement, 'PETR4', 'buy')).toMatchObject({
            tradeDate: '2025-02-10',
            quantity: '200',
            unitPrice: '36.1',
            grossMinor: 722000,
            direction: 'credit',
            appliedToPosition: true,
            alreadyImported: false
        });
        expect(operationOf(statement, 'ITUB4', 'sell')).toMatchObject({ tradeDate: '2025-09-15', direction: 'debit', grossMinor: 349000 });
    });

    it('tira o F do mercado fracionário', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-negociacao.csv'));
        const fractional: ParsedOperation | undefined = statement.operations.find(
            (operation: ParsedOperation): boolean => operation.tradeDate === '2026-01-19'
        );

        expect(fractional).toMatchObject({ ticker: 'PETR4', quantity: '7', grossMinor: 25935, market: 'mercado fracionario' });
    });

    it('marca como já importada a linha que repete uma nota', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-negociacao.xlsx'));
        const known: ReadonlySet<string> = new Set<string>([operationOf(statement, 'PETR4', 'buy').matchKey]);

        const marked: ParsedInvestmentStatement = markAlreadyImported(statement, known);

        expect(marked.operations.filter((operation: ParsedOperation): boolean => operation.alreadyImported)).toHaveLength(1);
        expect(operationOf(marked, 'PETR4', 'buy').alreadyImported).toBe(true);
        expect(operationOf(marked, 'VALE3', 'buy').alreadyImported).toBe(false);
    });

    it('acha a aba e o cabeçalho pelos nomes, em outra linha e com colunas fora de ordem', async () => {
        const bytes: Uint8Array = await workbookBytes({
            Resumo: [['Relatório de negociação'], ['Período: 2025']],
            'Meus negócios': [
                ['Relatório de Negociação'],
                [],
                ['Preço', 'Quantidade', 'Código de Negociação', 'Tipo de Movimentação', 'Data do Negócio', 'Mercado'],
                [10.5, 100, 'PETR4', 'Compra', '03/02/2025', 'Mercado à Vista']
            ]
        });

        const statement: ParsedInvestmentStatement = await readB3Report(bytes);

        expect(statement.operations).toHaveLength(1);
        expect(statement.operations[0]).toMatchObject({ ticker: 'PETR4', unitPrice: '10.5', quantity: '100', grossMinor: 105000, line: 4 });
    });

    it('rejeita linha inválida com o motivo e ignora mercado que não lê', async () => {
        const header: string[] = ['Data do Negócio', 'Tipo de Movimentação', 'Mercado', 'Código de Negociação', 'Quantidade', 'Preço'];
        const bytes: Uint8Array = await workbookBytes({
            Negociação: [
                header,
                ['31/02/2025', 'Compra', 'Mercado à Vista', 'PETR4', 1, 1],
                ['03/02/2025', 'Troca', 'Mercado à Vista', 'PETR4', 1, 1],
                ['03/02/2025', 'Compra', 'Mercado à Vista', '', 1, 1],
                ['03/02/2025', 'Compra', 'Mercado à Vista', 'PETR4', 0, 1],
                ['03/02/2025', 'Compra', 'Mercado à Vista', 'PETR4', 1, '-'],
                ['03/02/2025', 'Compra', 'Opções', 'PETRA100', 1, 1]
            ]
        });

        const statement: ParsedInvestmentStatement = await readB3Report(bytes);

        expect(statement.operations).toEqual([]);
        expect(statement.rejected.map((line) => line.reason)).toEqual([
            'invalid_date',
            'invalid_side',
            'missing_asset',
            'invalid_quantity',
            'invalid_price'
        ]);
        expect(statement.ignored).toMatchObject([{ reason: 'unsupported_market', description: 'PETRA100' }]);
    });
});

describe('readB3Report: Movimentação', () => {
    it('lê desdobramento como evento que muda a posição', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-movimentacao.xlsx'));

        expect(operationOf(statement, 'ITUB4', 'split')).toMatchObject({
            tradeDate: '2025-12-02',
            quantity: '100',
            direction: 'credit',
            unitPrice: null,
            grossMinor: null,
            appliedToPosition: true
        });
        expect(operationOf(statement, 'PETR4', 'bonus')).toMatchObject({ quantity: '20', unitPrice: '31.5', grossMinor: 63000 });
    });

    it('guarda provento no histórico sem efeito na posição', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-movimentacao.csv'));
        const incomes: ParsedOperation[] = statement.operations.filter(
            (operation: ParsedOperation): boolean => operation.kind === 'income'
        );

        expect(incomes.map((operation) => operation.incomeKind)).toEqual(['dividend', 'jcp', 'fii_income', 'fii_income', 'dividend']);
        expect(incomes.every((operation: ParsedOperation): boolean => !operation.appliedToPosition)).toBe(true);
        expect(incomes[0]).toMatchObject({ ticker: 'ITUB4', quantity: '300', unitPrice: '0.12', grossMinor: 3600 });
    });

    it('ignora liquidação e movimento de renda fixa com o motivo', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-movimentacao.xlsx'));

        expect(statement.ignored.filter((line) => line.reason === 'settlement')).toHaveLength(4);
        expect(statement.ignored.filter((line) => line.reason === 'unsupported_movement').map((line) => line.description)).toEqual([
            'Pagamento de Juros',
            'Amortização'
        ]);
        expect(statement.operations.map((operation) => operation.kind).sort()).toEqual([
            'bonus',
            'income',
            'income',
            'income',
            'income',
            'income',
            'split'
        ]);
    });

    it('rejeita provento sem valor e linha sem sentido', async () => {
        const header: string[] = ['Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Quantidade', 'Preço unitário', 'Valor da Operação'];
        const bytes: Uint8Array = await workbookBytes({
            Movimentação: [
                header,
                ['Credito', '10/01/2025', 'Dividendo', 'ITUB4 - ITAU', 10, '-', '-'],
                ['Lado', '10/01/2025', 'Dividendo', 'ITUB4 - ITAU', 10, 1, 10],
                ['Credito', '10/01/2025', 'Dividendo', '-', 10, 1, 10],
                ['Credito', 'ontem', 'Dividendo', 'ITUB4 - ITAU', 10, 1, 10],
                ['Credito', '10/01/2025', 'Dividendo', 'ITUB4 - ITAU', '-', 1, 10],
                ['Debito', '11/01/2025', 'Transferência', 'ITUB4 - ITAU', 5, '-', '-']
            ]
        });

        const statement: ParsedInvestmentStatement = await readB3Report(bytes);

        expect(statement.rejected.map((line) => line.reason)).toEqual([
            'invalid_amount',
            'invalid_side',
            'missing_asset',
            'invalid_date',
            'invalid_quantity'
        ]);
        expect(statement.operations).toMatchObject([{ kind: 'transfer', direction: 'debit', appliedToPosition: false }]);
    });
});

describe('readB3Report: Posição', () => {
    it('lê todas as abas do Excel como ajuste de quantidade final', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao.xlsx'));
        const byTicker: Map<string | null, ParsedPositionAdjustment> = new Map(
            statement.positionAdjustments.map((adjustment: ParsedPositionAdjustment) => [adjustment.ticker ?? adjustment.isin, adjustment])
        );

        expect(statement.reportKinds).toEqual(['position']);
        expect(statement.operations).toEqual([]);
        expect(statement.positionAdjustments).toHaveLength(3 + 1 + 2 + 2 + 3);
        expect(byTicker.get('PETR4')).toMatchObject({
            group: 'stock',
            quantity: '227',
            institution: 'CORRETORA EXEMPLO',
            referencePrice: '38.52'
        });
        expect(byTicker.get('AAPL34')).toMatchObject({ group: 'bdr', quantity: '80' });
        expect(byTicker.get('BOVA11')).toMatchObject({ group: 'etf' });
    });

    it('lê a aba Fundo de Investimento por ticker, CNPJ e ISIN', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao.xlsx'));
        const funds: ParsedPositionAdjustment[] = statement.positionAdjustments.filter(
            (adjustment: ParsedPositionAdjustment): boolean => adjustment.group === 'fund'
        );

        expect(funds).toHaveLength(2);
        expect(funds[0]).toMatchObject({
            ticker: 'HGLG11',
            cnpj: '77.777.777/0001-00',
            isin: 'BREXEMCTF003',
            quantity: '60'
        });
    });

    it('lê Tesouro Direto com quantidade fracionada e sem ticker', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao.xlsx'));
        const treasury: ParsedPositionAdjustment[] = statement.positionAdjustments.filter(
            (adjustment: ParsedPositionAdjustment): boolean => adjustment.group === 'treasury'
        );

        expect(treasury.map((adjustment) => adjustment.quantity)).toEqual(['1.25', '3.4', '5']);
        expect(treasury[0]).toMatchObject({
            ticker: null,
            productName: 'Tesouro Selic 2029',
            isin: 'BREXEMLFT001',
            indexer: 'SELIC',
            maturityDate: '2029-03-01'
        });
    });

    it('devolve a renda fixa privada como entrada própria, sem criar título', async () => {
        const statement: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao.xlsx'));
        const byCode: Map<string | null, ParsedInvestmentStatement['fixedIncome'][number]> = new Map(
            statement.fixedIncome.map((entry) => [entry.code, entry])
        );

        expect(statement.fixedIncome).toHaveLength(8);
        expect(byCode.get('CDB-EX-POS112')).toMatchObject({
            product: 'CDB - CDB EXEMPLO 112% CDI',
            issuer: 'BANCO EXEMPLO',
            indexer: 'DI',
            issueDate: '2024-03-15',
            maturityDate: '2028-03-15',
            quantity: '10',
            unitPrices: { mtm: '1464.48', curve: '1458.65', closing: '1464.48' },
            values: { mtmMinor: 1464480, curveMinor: 1458650, closingMinor: 1464480 }
        });
        expect(byCode.get('CDB-EX-CAREN')).toMatchObject({
            availableQuantity: '0',
            unavailableQuantity: '4',
            restrictionReason: 'Carência'
        });
        expect(byCode.get('CDB-EX-SEMIDX')).toMatchObject({ indexer: null });
        expect(byCode.get('CDB-EX-SEMCURVA')?.unitPrices.curve).toBeNull();
    });

    it('lê o CSV de cada aba da posição', async () => {
        const fund: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao-fundo-de-investimento.csv'));
        const fixed: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao-renda-fixa.csv'));
        const treasury: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao-tesouro-direto.csv'));
        const stocks: ParsedInvestmentStatement = await readB3Report(fixture('b3-posicao-acoes.csv'));

        expect(fund.positionAdjustments.map((adjustment) => adjustment.group)).toEqual(['fund', 'fund']);
        expect(fixed.fixedIncome).toHaveLength(8);
        expect(treasury.positionAdjustments.map((adjustment) => adjustment.quantity)).toEqual(['1.25', '3.4', '5']);
        expect(stocks.positionAdjustments.map((adjustment) => adjustment.quantity)).toEqual(['227', '100', '400']);
    });

    it('lê o fundo só pelo CNPJ quando não há ticker e rejeita linha sem ativo ou quantidade', async () => {
        const header: string[] = ['Produto', 'CNPJ do Fundo', 'Quantidade', 'Código de Negociação'];
        const bytes: Uint8Array = await workbookBytes({
            'Fundo de Investimento': [
                header,
                ['FUNDO EXEMPLO', '12.345.678/0001-00', '1.000,5', ''],
                ['FUNDO SEM CHAVE', '', 3, ''],
                ['FUNDO NEGATIVO', '12.345.678/0001-00', -3, 'ABCD11']
            ]
        });

        const statement: ParsedInvestmentStatement = await readB3Report(bytes);

        expect(statement.positionAdjustments).toMatchObject([
            { ticker: null, productName: 'FUNDO EXEMPLO', cnpj: '12.345.678/0001-00', quantity: '1000.5' }
        ]);
        expect(statement.rejected.map((line) => line.reason)).toEqual(['missing_asset', 'invalid_quantity']);
    });
});

describe('readB3Report: o que não lê', () => {
    it('manda o PDF para o Excel enquanto não há leitura por modelo', async () => {
        const error: unknown = await readB3Report(fixture('b3-posicao.pdf')).catch((reason: unknown): unknown => reason);

        expect(error).toBeInstanceOf(FormatNotRecognizedError);
        expect(error).toMatchObject({ code: 'format.not_recognized', status: 422, meta: { suggestion: 'b3_excel_download' } });
    });

    it('recusa planilha de outro tipo', async () => {
        const bytes: Uint8Array = await workbookBytes({
            Gastos: [
                ['Data', 'Descrição', 'Valor'],
                ['01/01/2025', 'Mercado', 10]
            ]
        });

        const error: unknown = await readB3Report(bytes).catch((reason: unknown): unknown => reason);

        expect(error).toMatchObject({ code: 'format.not_recognized', meta: undefined });
    });

    it('recusa CSV de outro tipo, arquivo vazio e arquivo corrompido', async () => {
        const csv: Uint8Array = new TextEncoder().encode('a;b\n1;2\n');
        const corrupted: Uint8Array = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]);

        await expect(readB3Report(csv)).rejects.toMatchObject({ code: 'format.not_recognized' });
        await expect(readB3Report(new Uint8Array())).rejects.toMatchObject({ code: 'format.not_recognized' });
        await expect(readB3Report(corrupted)).rejects.toMatchObject({ code: 'format.not_recognized' });
    });

    it('recusa relatório com linhas demais', async () => {
        const lines: string[] = ['Data do Negócio;Tipo de Movimentação;Código de Negociação;Quantidade;Preço'];
        for (let index: number = 0; index < 20_001; index += 1) {
            lines.push('01/02/2025;Compra;PETR4;1;1');
        }

        await expect(readB3Report(new TextEncoder().encode(lines.join('\n')))).rejects.toMatchObject({ code: 'format.too_many_rows' });
    });
});
