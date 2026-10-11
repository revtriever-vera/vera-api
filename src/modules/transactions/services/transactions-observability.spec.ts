import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { TransactionsLogService } from './transactions-log.service';
import { TransactionsMetricsService } from './transactions-metrics.service';

describe('TransactionsLogService', () => {
    it('registra só contagens e ids, nunca descrição, valor, favorecido nem chave', () => {
        const info: ReturnType<typeof vi.fn> = vi.fn();
        const service: TransactionsLogService = new TransactionsLogService({ info } as unknown as LogService);

        service.ingested('pluggy', 'acc', { inserted: 1, updated: 2, unchanged: 3, duplicates: 4, superseded: 5, rejected: 6 }, 12);
        service.recategorized('t1', true, 3);
        service.portScope('rule_saved', 3);

        expect(info.mock.calls.map((call: unknown[]) => (call[0] as { identifier: string }).identifier)).toEqual([
            'transactions-ingest',
            'transactions-recategorize',
            'transactions-port'
        ]);
        expect(info.mock.calls[0]?.[0]).toMatchObject({
            meta: {
                source: 'pluggy',
                accountId: 'acc',
                inserted: 1,
                updated: 2,
                unchanged: 3,
                duplicates: 4,
                superseded: 5,
                rejected: 6,
                durationMs: 12
            }
        });
        expect(Object.keys((info.mock.calls[1]?.[0] as { meta: object }).meta)).toEqual(['transactionId', 'ruleCreated', 'recategorized']);
    });
});

describe('TransactionsMetricsService', () => {
    it('conta cada resultado da ingestão e só os que aconteceram', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const service: TransactionsMetricsService = new TransactionsMetricsService({ count } as unknown as MetricsService);

        service.ingested('ofx', { inserted: 2, updated: 0, unchanged: 9, duplicates: 3, superseded: 0, rejected: 1 });

        expect(count.mock.calls).toEqual([
            ['vera_transactions_ingested_total', { source: 'ofx', result: 'inserted' }, 2],
            ['vera_transactions_ingested_total', { source: 'ofx', result: 'duplicate' }, 3],
            ['vera_transactions_ingested_total', { source: 'ofx', result: 'rejected' }, 1]
        ]);
    });

    it('conta as recategorizações por origem e ignora zero', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const service: TransactionsMetricsService = new TransactionsMetricsService({ count } as unknown as MetricsService);

        service.recategorized('manual', 1);
        service.recategorized('rule', 0);
        service.recategorized('rule', 4);

        expect(count.mock.calls).toEqual([
            ['vera_transactions_recategorized_total', { origin: 'manual' }, 1],
            ['vera_transactions_recategorized_total', { origin: 'rule' }, 4]
        ]);
    });
});
