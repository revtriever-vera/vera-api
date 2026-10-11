import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { SpendingCategoriesLogService } from './spending-categories-log.service';

describe('SpendingCategoriesLogService', () => {
    it('registra só ids, ação e contagem, nunca padrão, rótulo ou nome', () => {
        const info: ReturnType<typeof vi.fn> = vi.fn();
        const debug: ReturnType<typeof vi.fn> = vi.fn();
        const logs: SpendingCategoriesLogService = new SpendingCategoriesLogService({ info, debug } as unknown as LogService);

        logs.categoryWritten('c1', 'removed', 4);
        logs.ruleWritten('r1', 'contains', 'created', 2);
        logs.noRecategorizationDriver();

        expect(info.mock.calls.map((call: unknown[]) => call[0])).toEqual([
            {
                message: 'spending category written',
                identifier: 'spending-categories-write',
                meta: { categoryId: 'c1', action: 'removed', recategorized: 4 }
            },
            {
                message: 'spending rule written',
                identifier: 'spending-rules-write',
                meta: { ruleId: 'r1', matchType: 'contains', action: 'created', recategorized: 2 }
            }
        ]);
        expect(debug).toHaveBeenCalledTimes(1);
    });
});
