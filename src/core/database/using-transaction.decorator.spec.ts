import { describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from './database.client';
import { TransactionalContext, UsingTransaction } from './using-transaction.decorator';

describe('TransactionalContext', () => {
    it('throws a clear error when read before DatabaseModule sets it', () => {
        const holder: { client: DatabaseClient | null } = TransactionalContext as unknown as { client: DatabaseClient | null };
        holder.client = null;

        expect(() => TransactionalContext.get()).toThrow('TransactionalContext not initialized');
    });

    it('returns whatever DatabaseModule set once it has been set', () => {
        const client: DatabaseClient = {} as unknown as DatabaseClient;

        TransactionalContext.set(client);

        expect(TransactionalContext.get()).toBe(client);
    });
});

describe('UsingTransaction', () => {
    it('wraps the decorated method in DatabaseClient.withTransaction', async () => {
        const withTransaction: ReturnType<typeof vi.fn> = vi.fn(async (fn: () => Promise<unknown>): Promise<unknown> => fn());
        TransactionalContext.set({ withTransaction } as unknown as DatabaseClient);

        class Sample {
            @UsingTransaction()
            public async run(value: string): Promise<string> {
                return Promise.resolve(`ran:${value}`);
            }
        }

        await expect(new Sample().run('x')).resolves.toBe('ran:x');
        expect(withTransaction).toHaveBeenCalledOnce();
    });
});
