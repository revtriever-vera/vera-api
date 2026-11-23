import { describe, expect, it } from 'vitest';
import { RecurringSeriesRecord } from './recurring-series.types';
import { deriveTimeAlerts, TimeAlertInput } from './time-alerts';

const TODAY: string = '2026-11-23';

function input(overrides: Partial<RecurringSeriesRecord>, extra: Partial<TimeAlertInput> = {}): TimeAlertInput {
    const series = {
        id: 's1',
        status: 'suggested',
        cadence: 'monthly',
        expectedDay: 5,
        typicalAmountMinor: 5590,
        lastDate: '2026-11-05',
        snoozedUntil: null,
        ...overrides
    } as RecurringSeriesRecord;
    return { series, createdOn: '2026-10-01', chargeCount: 3, ...extra };
}

describe('deriveTimeAlerts', () => {
    it('pergunta "você ainda usa?" da sugestão com 3 cobranças e 30 dias sem revisão', () => {
        const alerts = deriveTimeAlerts([input({})], TODAY);

        expect(alerts).toEqual([
            {
                id: 'still_using:s1',
                seriesId: 's1',
                kind: 'still_using',
                occurredOn: '2026-11-05',
                data: { chargeCount: 3, amountMinor: 5590 }
            }
        ]);
    });

    it('não pergunta com menos de 3 cobranças, antes de 30 dias, adiada ou já confirmada', () => {
        expect(deriveTimeAlerts([input({}, { chargeCount: 2 })], TODAY)).toEqual([]);
        expect(deriveTimeAlerts([input({}, { createdOn: '2026-11-01' })], TODAY)).toEqual([]);
        expect(deriveTimeAlerts([input({ snoozedUntil: '2026-12-01' })], TODAY)).toEqual([]);
        expect(deriveTimeAlerts([input({ status: 'confirmed' })], TODAY)).toEqual([]);
    });

    it('avisa a renovação anual em até 30 dias, com o valor e os dias que faltam', () => {
        const annual = input({
            status: 'confirmed',
            cadence: 'annual',
            expectedDay: 11,
            lastDate: '2025-12-11',
            typicalAmountMinor: 23900
        });

        expect(deriveTimeAlerts([annual], TODAY)).toEqual([
            {
                id: 'renewal:s1',
                seriesId: 's1',
                kind: 'renewal',
                occurredOn: '2026-12-11',
                data: { renewalDate: '2026-12-11', amountMinor: 23900, daysUntil: 18 }
            }
        ]);
    });

    it('não avisa a anual que renova daqui a mais de 30 dias nem a que não é confirmada', () => {
        const far = input({ status: 'confirmed', cadence: 'annual', expectedDay: 11, lastDate: '2026-02-11' });
        const suggested = input({ cadence: 'annual', expectedDay: 11, lastDate: '2025-12-11' }, { chargeCount: 1 });

        expect(deriveTimeAlerts([far, suggested], TODAY)).toEqual([]);
    });
});
