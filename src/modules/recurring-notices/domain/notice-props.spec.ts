import { describe, expect, it } from 'vitest';
import { dueFromProps, duePropsOf, weekFromProps, weekPropsOf, WeekAlert, WeekEntry } from './notice-props';

const ENTRY: WeekEntry = { date: '2026-11-25', name: 'Netflix', amountMinor: 5590, estimate: false, card: true, account: 'Nubank' };
const ALERT: WeekAlert = { kind: 'price_increase', name: 'Netflix', values: { fromAmountMinor: 4490, toAmountMinor: 5590, percent: 24 } };

describe('notice-props', () => {
    it('leva a semana em texto e volta igual', () => {
        const props: Record<string, string> = weekPropsOf([ENTRY, { ...ENTRY, amountMinor: 1000 }], [ALERT]);

        expect(props['totalMinor']).toBe('6590');
        expect(weekFromProps(props)).toEqual({ totalMinor: 6590, entries: [ENTRY, { ...ENTRY, amountMinor: 1000 }], alerts: [ALERT] });
    });

    it('ignora JSON quebrado ou fora do formato', () => {
        expect(weekFromProps({ entries: '{', alerts: '[{"kind":1}]' })).toEqual({ totalMinor: 0, entries: [], alerts: [] });
        expect(weekFromProps({})).toEqual({ totalMinor: 0, entries: [], alerts: [] });
    });

    it('leva a véspera em texto e volta igual, com padrão vazio', () => {
        const due = { name: 'Seguro', amountMinor: 38900, estimate: true, card: false, account: 'Itaú', lastDate: '2026-10-28' };

        expect(dueFromProps(duePropsOf(due))).toEqual(due);
        expect(dueFromProps({})).toEqual({ name: '', amountMinor: 0, estimate: false, card: false, account: '', lastDate: '' });
    });
});
