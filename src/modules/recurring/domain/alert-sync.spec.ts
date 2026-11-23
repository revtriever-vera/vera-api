import { describe, expect, it } from 'vitest';
import { alertKey, diffAlerts } from './alert-sync';
import { AlertRecord, DesiredAlert } from './recurring-alerts.types';

function desired(overrides: Partial<DesiredAlert> = {}): DesiredAlert {
    return {
        seriesId: 's1',
        kind: 'price_increase',
        fingerprint: 'f1',
        occurredOn: '2026-11-05',
        data: { fromAmountMinor: 4490, toAmountMinor: 5590 },
        ...overrides
    };
}

function record(overrides: Partial<AlertRecord> = {}): AlertRecord {
    return { ...desired(), id: 'a1', seenAt: null, ...overrides };
}

describe('diffAlerts', () => {
    it('insere o novo, atualiza o que mudou e remove o que deixou de valer', () => {
        const existing: AlertRecord[] = [
            record({ id: 'keep' }),
            record({ id: 'change', fingerprint: 'f2' }),
            record({ id: 'gone', fingerprint: 'f3' })
        ];

        const diff = diffAlerts(existing, [
            desired(),
            desired({ fingerprint: 'f2', data: { fromAmountMinor: 4490, toAmountMinor: 6000 } }),
            desired({ fingerprint: 'f4' })
        ]);

        expect(diff.insert.map((alert: DesiredAlert): string => alert.fingerprint)).toEqual(['f4']);
        expect(diff.update.map((change) => change.id)).toEqual(['change']);
        expect(diff.removeIds).toEqual(['gone']);
    });

    it('a ordem das chaves do jsonb não conta como mudança', () => {
        const stored: AlertRecord = record({ data: { toAmountMinor: 5590, fromAmountMinor: 4490 } });

        expect(diffAlerts([stored], [desired()])).toEqual({ insert: [], update: [], removeIds: [] });
    });

    it('a chave junta série, tipo e ocorrência', () => {
        expect(alertKey(desired())).toBe('s1|price_increase|f1');
    });
});
