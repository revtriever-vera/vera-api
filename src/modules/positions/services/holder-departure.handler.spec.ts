import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { InvestmentOperationDomain } from '../domain/investment-operation.domain';
import { PositionDomain } from '../domain/position.domain';
import { PositionsHolderDepartureHandler } from './holder-departure.handler';

beforeAll(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('PositionsHolderDepartureHandler', () => {
    it('moves the positions of the person who left to the whole account and releases the class of the ones folded into another', async () => {
        const releaseHolder = vi.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
        const release = vi.fn().mockResolvedValue(undefined);
        const releaseOperations = vi.fn().mockResolvedValue(3);
        const handler: PositionsHolderDepartureHandler = new PositionsHolderDepartureHandler(
            { releaseHolder } as unknown as PositionDomain,
            { releaseHolder: releaseOperations } as unknown as InvestmentOperationDomain,
            { release } as unknown as ClassAssignmentService
        );

        await handler.onMemberRemoved('ana');

        expect(releaseHolder).toHaveBeenCalledWith('ana');
        expect(releaseOperations).toHaveBeenCalledWith('ana');
        expect(release.mock.calls).toEqual([
            ['position', 'p1'],
            ['position', 'p2']
        ]);
        expect(handler.area).toBe('positions-holder');
    });
});
