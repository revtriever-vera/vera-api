import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { FgcLogService } from './fgc-log.service';

describe('FgcLogService', () => {
    it('logs only the counts', () => {
        const debug = vi.fn();

        new FgcLogService({ debug } as unknown as LogService).computed(3, 1, 2);

        expect(debug).toHaveBeenCalledWith({
            message: 'fgc coverage computed',
            identifier: 'fgc-coverage',
            meta: { groups: 3, overGroups: 1, outside: 2 }
        });
    });
});
