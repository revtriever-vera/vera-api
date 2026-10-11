import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { SpendingCategoriesMetricsService } from './spending-categories-metrics.service';

describe('SpendingCategoriesMetricsService', () => {
    it('conta categorização por origem e ação de regra por tipo', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const metrics: SpendingCategoriesMetricsService = new SpendingCategoriesMetricsService({ count } as unknown as MetricsService);

        metrics.categorized('none', 12);
        metrics.ruleAction('created', 'contains');

        expect(count).toHaveBeenNthCalledWith(1, 'vera_categorization_total', { source: 'none' }, 12);
        expect(count).toHaveBeenNthCalledWith(2, 'vera_spending_rules_total', { action: 'created', matchType: 'contains' });
    });
});
