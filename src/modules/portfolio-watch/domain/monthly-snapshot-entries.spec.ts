import { describe, expect, it } from 'vitest';
import { Holding, PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import { monthOf, monthlySnapshotEntriesOf, monthsBefore } from './monthly-snapshot-entries';

function holding(overrides: Partial<Holding>): Holding {
    return {
        kind: 'position',
        id: 'p1',
        assetId: 'a1',
        classId: 'c1',
        quantity: '10',
        unitPrice: '2.5',
        priceDate: '2026-12-01',
        valueMinor: 2500,
        isSample: false,
        isZeroQuantity: false,
        ...overrides
    } as Holding;
}

function snapshotOf(holdings: Holding[]): PortfolioSnapshot {
    return { baseCurrency: 'BRL', holdings } as unknown as PortfolioSnapshot;
}

describe('monthlySnapshotEntriesOf', () => {
    it('uma linha por ativo, na moeda base', () => {
        const entries = monthlySnapshotEntriesOf(snapshotOf([holding({})]));

        expect(entries).toEqual([
            {
                assetId: 'a1',
                holdingKind: 'position',
                classId: 'c1',
                quantity: '10',
                price: '2.5',
                priceDate: '2026-12-01',
                valueMinor: 2500,
                currency: 'BRL'
            }
        ]);
    });

    it('soma o mesmo ativo de donos diferentes', () => {
        const entries = monthlySnapshotEntriesOf(
            snapshotOf([holding({ id: 'p1' }), holding({ id: 'p2', quantity: '5.5', valueMinor: 1375 })])
        );

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ quantity: '15.5', valueMinor: 3875 });
    });

    it('renda fixa entra pelo id do título, sem quantidade, e exemplo e posição zerada ficam fora', () => {
        const entries = monthlySnapshotEntriesOf(
            snapshotOf([
                holding({
                    kind: 'fixed_income',
                    id: 't1',
                    assetId: null,
                    quantity: null,
                    unitPrice: null,
                    priceDate: null,
                    valueMinor: 10_500_000
                }),
                holding({ id: 's', assetId: 'sample', isSample: true }),
                holding({ id: 'z', assetId: 'zero', isZeroQuantity: true })
            ])
        );

        expect(entries).toEqual([
            {
                assetId: 't1',
                holdingKind: 'fixed_income',
                classId: 'c1',
                quantity: null,
                price: null,
                priceDate: null,
                valueMinor: 10_500_000,
                currency: 'BRL'
            }
        ]);
    });
});

describe('meses', () => {
    it('o mês é o do dia local', () => {
        expect(monthOf('2026-12-01')).toBe('2026-12');
    });

    it('conta meses para trás atravessando o ano', () => {
        expect(monthsBefore('2026-12', 36)).toBe('2023-12');
        expect(monthsBefore('2026-02', 3)).toBe('2025-11');
        expect(monthsBefore('2026-01', 1)).toBe('2025-12');
    });
});
