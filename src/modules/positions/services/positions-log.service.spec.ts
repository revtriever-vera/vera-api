import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { PositionsLogService } from './positions-log.service';

describe('PositionsLogService', () => {
    it('registra só ids e ação, nunca quantidade nem preço médio', () => {
        const info: ReturnType<typeof vi.fn> = vi.fn();
        const logs: PositionsLogService = new PositionsLogService({ info } as unknown as LogService);

        logs.written('created', 'p1', 'a1');
        logs.duplicate('a1', 'p1');

        expect(info.mock.calls.map((call: unknown[]) => call[0])).toEqual([
            { message: 'position written', identifier: 'positions-write', meta: { positionId: 'p1', assetId: 'a1', action: 'created' } },
            { message: 'asset already in portfolio', identifier: 'positions-duplicate', meta: { assetId: 'a1', existingPositionId: 'p1' } }
        ]);
    });
});
