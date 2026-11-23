import { describe, expect, it } from 'vitest';
import { expenseAverage } from './expense-average';
import { CategoryInfo, CategoryMonthNet } from './spending-summary.types';

function category(id: string, kind: string): CategoryInfo {
    return { id, systemKey: null, name: null, icon: 'Home', kind, flexibility: null, position: 1 };
}

function net(month: string, categoryId: string | null, netMinor: number, outflowMinor: number = Math.min(netMinor, 0)): CategoryMonthNet {
    return { month, categoryId, netMinor, outflowMinor, outflowCount: 1, transactionCount: 1 };
}

const CATEGORIES: readonly CategoryInfo[] = [category('rent', 'expense'), category('pay', 'income'), category('card', 'transfer')];

describe('expenseAverage', () => {
    it('sem mês com transação não há média', () => {
        expect(expenseAverage('2026-11', [], [], CATEGORIES)).toEqual({ months: [], averageMinor: null });
    });

    it('média dos 3 meses fechados, só gasto: renda e transferência ficam fora, sem categoria entra', () => {
        const nets: CategoryMonthNet[] = [
            net('2026-08', 'rent', -100000),
            net('2026-09', 'rent', -200000),
            net('2026-10', 'rent', -300000),
            net('2026-10', 'pay', 900000),
            net('2026-10', 'card', -500000),
            net('2026-10', null, -30000),
            net('2026-11', 'rent', -999999)
        ];

        const result = expenseAverage('2026-11', ['2026-08', '2026-09', '2026-10', '2026-11'], nets, CATEGORIES);

        expect(result.months).toEqual(['2026-08', '2026-09', '2026-10']);
        expect(result.averageMinor).toBe(210000);
    });

    it('conta só os meses com dados e arredonda meio para cima', () => {
        const nets: CategoryMonthNet[] = [net('2026-09', 'rent', -100001), net('2026-10', 'rent', -100002)];

        const result = expenseAverage('2026-11', ['2026-09', '2026-10'], nets, CATEGORIES);

        expect(result.months).toEqual(['2026-09', '2026-10']);
        expect(result.averageMinor).toBe(100002);
    });
});
