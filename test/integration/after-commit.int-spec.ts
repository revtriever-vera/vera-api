import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, TestDatabase } from './support/test-database';

describe('afterCommit', () => {
    let db: TestDatabase;

    beforeAll(async () => {
        db = await createTestDatabase();
    });

    afterAll(async () => {
        await db.destroy();
    });

    it('runs the callback only after the transaction commits', async () => {
        const order: string[] = [];
        await db.client.withTransaction(async () => {
            await sql`select 1`.execute(db.client.executor);
            await db.client.afterCommit(async () => {
                order.push('callback');
                return Promise.resolve();
            });
            order.push('inside-transaction');
        });
        expect(order).toEqual(['inside-transaction', 'callback']);
    });

    it('discards callbacks when the transaction rolls back', async () => {
        const executed: string[] = [];
        await expect(
            db.client.withTransaction(async () => {
                await db.client.afterCommit(async () => {
                    executed.push('should-not-run');
                    return Promise.resolve();
                });
                throw new Error('rollback');
            })
        ).rejects.toThrow('rollback');
        expect(executed).toEqual([]);
    });

    it('runs immediately when there is no transaction', async () => {
        const executed: string[] = [];
        await db.client.afterCommit(async () => {
            executed.push('ran');
            return Promise.resolve();
        });
        expect(executed).toEqual(['ran']);
    });

    it('does not let a failing callback break the caller', async () => {
        const result: string = await db.client.withTransaction(async () => {
            await db.client.afterCommit(async () => Promise.reject(new Error('publish falhou')));
            return 'commited';
        });
        expect(result).toBe('commited');
    });
});
