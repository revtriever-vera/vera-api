import { AsyncLocalStorage } from 'node:async_hooks';
import { BeforeApplicationShutdown, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Kysely, PostgresDialect, Transaction, sql } from 'kysely';
import { Pool } from 'pg';
import { AfterCommitCallback, DatabaseClient } from './database.client';
import { databaseConfig } from './config/database.config';
import { DB } from './generated/database.types';
import { LogService } from '../observability/log.service';

const AFTER_COMMIT: string = 'database-after-commit';

@Injectable()
export class KyselyDatabaseClient extends DatabaseClient implements BeforeApplicationShutdown {
    private readonly root: Kysely<DB>;
    private readonly transactions: AsyncLocalStorage<Transaction<DB>> = new AsyncLocalStorage<Transaction<DB>>();
    private readonly pending: AsyncLocalStorage<AfterCommitCallback[]> = new AsyncLocalStorage<AfterCommitCallback[]>();

    public constructor(
        @Inject(databaseConfig.KEY) config: ConfigType<typeof databaseConfig>,
        private readonly logService: LogService
    ) {
        super();
        this.root = new Kysely<DB>({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: config.DATABASE_URL, max: config.DATABASE_POOL_MAX })
            })
        });
    }

    public get executor(): Kysely<DB> {
        return this.transactions.getStore() ?? this.root;
    }

    public async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
        const current: Transaction<DB> | undefined = this.transactions.getStore();
        if (current) {
            return fn();
        }
        const callbacks: AfterCommitCallback[] = [];
        const result: T = await this.root
            .transaction()
            .execute(async (trx: Transaction<DB>) => this.transactions.run(trx, async () => this.pending.run(callbacks, fn)));
        await this.runCallbacks(callbacks);
        return result;
    }

    public async afterCommit(callback: AfterCommitCallback): Promise<void> {
        const callbacks: AfterCommitCallback[] | undefined = this.pending.getStore();
        if (!callbacks) {
            await callback();
            return;
        }
        callbacks.push(callback);
    }

    public async isHealthy(): Promise<boolean> {
        try {
            await sql`select 1`.execute(this.root);
            return true;
        } catch {
            return false;
        }
    }

    private async runCallbacks(callbacks: readonly AfterCommitCallback[]): Promise<void> {
        for (const callback of callbacks) {
            await this.runCallback(callback);
        }
    }

    private async runCallback(callback: AfterCommitCallback): Promise<void> {
        try {
            await callback();
        } catch (error) {
            this.logService.error({ message: 'after-commit callback failed', identifier: AFTER_COMMIT, error });
        }
    }

    public async destroy(): Promise<void> {
        await this.root.destroy();
    }

    public async beforeApplicationShutdown(): Promise<void> {
        await this.destroy();
    }
}
