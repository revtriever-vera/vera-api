import { describe, expect, it, vi } from 'vitest';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { RecurringAlertsDomain } from '../domain/recurring-alerts.domain';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringSeriesRecord } from '../domain/recurring-series.types';
import { RecurringAccountExporter } from './recurring-account.exporter';

function seriesOf(id: string, accountId: string): RecurringSeriesRecord {
    return {
        id,
        name: `Série ${id}`,
        merchantKey: 'NETFLIX',
        accountId,
        cadence: 'monthly',
        valueMode: 'fixed',
        kind: 'subscription',
        status: 'confirmed',
        origin: 'detected',
        typicalAmountMinor: 5590,
        minAmountMinor: 5590,
        maxAmountMinor: 5590,
        expectedDay: 7,
        dayChange: null,
        knownSubscription: true,
        firstDate: '2026-07-07',
        lastDate: '2026-10-07',
        snoozedUntil: null,
        confirmedAt: new Date('2026-10-08T10:00:00Z'),
        dismissedAt: null,
        stoppedAt: null,
        stoppedBy: null,
        createdAt: new Date('2026-10-08T10:00:00Z'),
        updatedAt: new Date('2026-10-08T10:00:00Z')
    };
}

function build(): RecurringAccountExporter {
    return new RecurringAccountExporter(
        {
            list: vi.fn().mockResolvedValue([seriesOf('real', 'a-real'), seriesOf('demo', 'a-sample')]),
            exportCharges: vi.fn().mockResolvedValue([
                { id: 'l1', seriesId: 'real', transactionId: 't2', role: 'charge' },
                { id: 'l2', seriesId: 'real', transactionId: 't1', role: 'charge' },
                { id: 'l3', seriesId: 'demo', transactionId: 't3', role: 'charge' }
            ]),
            exportSuppressions: vi.fn().mockResolvedValue([
                { seriesId: 'real', merchantKey: 'SPOTIFY', typicalAmountMinor: 3490, createdAt: new Date('2026-10-09T00:00:00Z') },
                { seriesId: 'demo', merchantKey: 'DEMO', typicalAmountMinor: 100, createdAt: new Date('2026-10-09T00:00:00Z') }
            ])
        } as unknown as RecurringSeriesDomain,
        {
            list: vi.fn().mockResolvedValue([
                { seriesId: 'real', kind: 'price_increase', occurredOn: '2026-10-07', seenAt: null, data: { from: 4490, to: 5590 } },
                { seriesId: 'demo', kind: 'returned', occurredOn: '2026-10-07', seenAt: null, data: {} }
            ])
        } as unknown as RecurringAlertsDomain,
        {
            list: vi.fn().mockResolvedValue([
                { id: 'a-real', name: 'Cartão', isSample: false },
                { id: 'a-sample', name: 'Cartão de exemplo', isSample: true }
            ])
        } as unknown as FinancialAccountService,
        {
            findForRecurrence: vi.fn().mockResolvedValue([
                { id: 't1', date: '2026-09-07', amountMinor: -5590 },
                { id: 't2', date: '2026-10-07', amountMinor: -5590 },
                { id: 't3', date: '2026-10-07', amountMinor: -100 }
            ])
        } as unknown as TransactionReaderService
    );
}

describe('RecurringAccountExporter', () => {
    it('exporta séries, cobranças por data, supressões e alertas só da conta real, sem ids nem dados de exemplo', async () => {
        const exported = await build().exportAll();

        expect(exported.series).toHaveLength(1);
        expect(exported.series[0]).toMatchObject({
            name: 'Série real',
            account: 'Cartão',
            kind: 'subscription',
            cadence: 'monthly',
            status: 'confirmed',
            typicalAmountMinor: 5590,
            confirmedAt: '2026-10-08T10:00:00.000Z',
            charges: [
                { date: '2026-09-07', amountMinor: -5590, role: 'charge' },
                { date: '2026-10-07', amountMinor: -5590, role: 'charge' }
            ]
        });
        expect(exported.suppressions).toEqual([
            { merchantKey: 'SPOTIFY', typicalAmountMinor: 3490, createdAt: '2026-10-09T00:00:00.000Z' }
        ]);
        expect(exported.alerts).toEqual([
            { series: 'Série real', kind: 'price_increase', occurredOn: '2026-10-07', seen: false, data: { from: 4490, to: 5590 } }
        ]);
        expect(JSON.stringify(exported)).not.toMatch(/"id"|companyId|a-real|DEMO/);
    });
});
