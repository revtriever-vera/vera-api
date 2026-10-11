import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { AllocationLogService } from './allocation-log.service';

describe('AllocationLogService', () => {
    it('registra ações de classe e atribuição só com ids, nunca com o nome digitado', () => {
        const info: ReturnType<typeof vi.fn> = vi.fn();
        const logs: AllocationLogService = new AllocationLogService({ info } as unknown as LogService);

        logs.classChanged('renamed', 'class-1');
        logs.defaultsSeeded(8);
        logs.assignmentChanged('position', 'subject-1', 'class-1');
        logs.assignmentReleased('fixed_income', 'subject-2');

        expect(info.mock.calls.map((call: unknown[]) => call[0])).toEqual([
            { message: 'asset class changed', identifier: 'allocation-classes', meta: { action: 'renamed', classId: 'class-1' } },
            { message: 'default asset classes seeded', identifier: 'allocation-classes', meta: { action: 'seeded', count: 8 } },
            {
                message: 'asset class assignment changed',
                identifier: 'allocation-assignment',
                meta: { subjectType: 'position', subjectId: 'subject-1', classId: 'class-1' }
            },
            {
                message: 'asset class assignment released',
                identifier: 'allocation-assignment',
                meta: { subjectType: 'fixed_income', subjectId: 'subject-2' }
            }
        ]);
    });
});
