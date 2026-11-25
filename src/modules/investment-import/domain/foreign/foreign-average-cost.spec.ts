import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyOperations, AverageCostResult } from '../../../positions/domain/average-cost';
import { CostOperation } from '../../../positions/domain/investment-operations.types';
import { statementOfModelAnswers } from '../model/model-statement';
import { ParsedOperation } from '../investment-statement.types';
import { foreignStatementOf } from './foreign-statement';

const FIXTURES: string = join(__dirname, '..', '..', '..', '..', '..', 'test', 'fixtures', 'investment-import', 'generated', 'avenue');

function monthOperations(slug: string, ticker: string): CostOperation[] {
    const text: string = readFileSync(join(FIXTURES, `avenue-${slug}.expected.json`), 'utf8');
    const statement = foreignStatementOf(
        statementOfModelAnswers([text], { labels: ['text'], unreadPages: [], today: '2026-11-25' }),
        new Map()
    );
    return statement.operations
        .filter(
            (operation: ParsedOperation): boolean => operation.ticker === ticker && (operation.kind === 'buy' || operation.kind === 'sell')
        )
        .map((operation: ParsedOperation, index: number): CostOperation => ({
            kind: operation.kind === 'buy' ? 'buy' : 'sell',
            tradeDate: operation.tradeDate,
            lineNumber: index + 1,
            quantity: operation.quantity,
            unitPrice: operation.unitPrice ?? '0',
            feesMinor: 0,
            currency: 'USD',
            dayTrade: false,
            historyOnly: false
        }));
}

describe('three Avenue months applied in order', () => {
    it('ends each month with the quantity of the portfolio summary and the average price from the history', () => {
        const july: AverageCostResult = applyOperations(null, monthOperations('2026-07', 'AAPL'));
        const august: AverageCostResult = july.ok ? applyOperations(july.balance, monthOperations('2026-08', 'AAPL')) : july;
        const september: AverageCostResult = august.ok ? applyOperations(august.balance, monthOperations('2026-09', 'AAPL')) : august;
        expect(july.ok && july.balance).toEqual({ quantity: '10', averagePrice: '190' });
        expect(august.ok && august.balance?.quantity).toBe('15');
        expect(august.ok && august.balance?.averagePrice).toBe('193.33333333');
        expect(september.ok && september.balance?.quantity).toBe('10');
        expect(september.ok && september.balance?.averagePrice).toBe('193.33333333');
    });

    it('a month alone has no cost for a sale of what was bought earlier', () => {
        const alone: AverageCostResult = applyOperations(null, monthOperations('2026-09', 'AAPL'));
        expect(alone.ok).toBe(false);
    });
});
