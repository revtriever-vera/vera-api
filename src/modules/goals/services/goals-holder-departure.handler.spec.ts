import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { GoalDomain } from '../domain/goal.domain';
import { GoalsHolderDepartureHandler } from './goals-holder-departure.handler';

beforeAll(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('GoalsHolderDepartureHandler', () => {
    it('releases the goals of the person who left to the whole account', async () => {
        const releaseHolder: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(1);
        const handler: GoalsHolderDepartureHandler = new GoalsHolderDepartureHandler({ releaseHolder } as unknown as GoalDomain);

        await handler.onMemberRemoved('u1');

        expect(handler.area).toBe('goals-holder');
        expect(releaseHolder).toHaveBeenCalledWith('u1');
    });
});
