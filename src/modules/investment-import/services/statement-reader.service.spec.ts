import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExchangeRateReaderService, StoredRate } from '../../market-data/services/exchange-rate-reader.service';
import { statementOfModelAnswers } from '../domain/model/model-statement';
import { ParsedInvestmentStatement, ParsedOperation } from '../domain/investment-statement.types';
import { ModelReaderService } from './model-reader.service';
import { StatementReaderService } from './statement-reader.service';

const FIXTURE: string = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'investment-import', 'generated', 'avenue');

function rig(rateOf: (day: string) => StoredRate | null): {
    readonly service: StatementReaderService;
    readonly latest: ReturnType<typeof vi.fn>;
} {
    const text: string = readFileSync(join(FIXTURE, 'avenue-2026-07.expected.json'), 'utf8');
    const statement: ParsedInvestmentStatement = statementOfModelAnswers([text], {
        labels: ['text'],
        unreadPages: [],
        today: '2026-11-25'
    });
    const latest: ReturnType<typeof vi.fn> = vi.fn((_currency: string, date: Date): Promise<StoredRate | null> =>
        Promise.resolve(rateOf(date.toISOString().slice(0, 10)))
    );
    const model: Pick<ModelReaderService, 'accepts' | 'read'> = {
        accepts: (): boolean => true,
        read: (): Promise<ParsedInvestmentStatement> => Promise.resolve(statement)
    };
    const service: StatementReaderService = new StatementReaderService(
        { latest } as unknown as ExchangeRateReaderService,
        model as ModelReaderService
    );
    return { service, latest };
}

function stored(date: string, brlPerUnit: string): StoredRate {
    return { currency: 'USD', brlPerUnit, date, source: 'bcb-ptax' };
}

function buy(statement: ParsedInvestmentStatement): ParsedOperation {
    return statement.operations.find(
        (operation: ParsedOperation): boolean => operation.kind === 'buy' && operation.ticker === 'AAPL'
    ) as ParsedOperation;
}

describe('StatementReaderService with a statement from a broker abroad', () => {
    it('asks for the rate of each distinct trade date and converts', async () => {
        const { service, latest } = rig((day: string): StoredRate => stored(day, '5.40'));
        const statement: ParsedInvestmentStatement = await service.read(Buffer.from('x'), true);
        expect(latest).toHaveBeenCalledTimes(2);
        expect(buy(statement).dollar?.grossBrlMinor).toBe(1026000);
    });

    it('takes the previous business day rate and flags the fallback', async () => {
        const { service } = rig((day: string): StoredRate => stored(day === '2026-07-08' ? '2026-07-07' : day, '5.40'));
        const statement: ParsedInvestmentStatement = await service.read(Buffer.from('x'), true);
        expect(statement.notes).toContainEqual({ code: 'foreign_rate_fallback', count: 1 });
    });

    it('drops a rate older than the lookback and flags the missing value', async () => {
        const { service } = rig((): StoredRate => stored('2026-06-01', '5.40'));
        const statement: ParsedInvestmentStatement = await service.read(Buffer.from('x'), true);
        expect(buy(statement).dollar?.fxRate).toBeNull();
        expect(statement.notes).toContainEqual({ code: 'foreign_rate_missing', count: 2 });
    });
});
