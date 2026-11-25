import { buildFixedIncomeSheet } from './b3-fixed-income';
import { buildMovementsSheet } from './b3-movements';
import { BDRS, buildFundsSheet, buildStocksSheet, buildTreasurySheet, ETFS, STOCKS } from './b3-positions';
import { buildTradesSheet } from './b3-trades';
import { ReportFile } from './sheet.types';

export function buildB3Reports(): ReportFile[] {
    return [
        { baseName: 'b3-negociacao', sheets: [buildTradesSheet()] },
        { baseName: 'b3-movimentacao', sheets: [buildMovementsSheet()] },
        {
            baseName: 'b3-posicao',
            sheets: [
                buildStocksSheet('Acoes', 'acoes', STOCKS),
                buildStocksSheet('BDR', 'bdr', BDRS),
                buildStocksSheet('ETF', 'etf', ETFS),
                buildFundsSheet(),
                buildFixedIncomeSheet(),
                buildTreasurySheet()
            ]
        }
    ];
}
