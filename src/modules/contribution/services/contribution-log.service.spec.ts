import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { ContributionLogService } from './contribution-log.service';

describe('ContributionLogService', () => {
    it('logs the counters of a suggestion under the contribution-suggest identifier', () => {
        const info = vi.fn();

        new ContributionLogService({ info } as unknown as LogService).suggested({ classesFunded: 3, assetsFunded: 5, warnings: 0 });

        expect(info).toHaveBeenCalledExactlyOnceWith({
            message: 'contribution suggested',
            identifier: 'contribution-suggest',
            meta: { classesFunded: 3, assetsFunded: 5, warnings: 0 }
        });
    });

    it('logs the refusal without any value', () => {
        const info = vi.fn();

        new ContributionLogService({ info } as unknown as LogService).targetsNotSet();

        expect(info.mock.calls[0]?.[0]).toMatchObject({ identifier: 'contribution-suggest', meta: { result: 'targets_not_set' } });
    });
});
