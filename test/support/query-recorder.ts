import {
    CompiledQuery,
    DatabaseConnection,
    Dialect,
    Driver,
    Kysely,
    PostgresAdapter,
    PostgresIntrospector,
    PostgresQueryCompiler,
    QueryResult,
    TransactionSettings
} from 'kysely';
import { DatabaseClient } from '../../src/core/database/database.client';
import { DB } from '../../src/core/database/generated/database.types';

export interface RecordedQuery {
    readonly sql: string;
    readonly parameters: readonly unknown[];
}

export class QueryRecorder {
    public readonly queries: RecordedQuery[] = [];
    public rows: Record<string, unknown>[] = [];
    public readonly client: DatabaseClient;

    public constructor() {
        this.client = {
            executor: new Kysely<DB>({ dialect: this.dialect() }),
            withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
            afterCommit: async (callback: () => Promise<void>): Promise<void> => callback(),
            isHealthy: async (): Promise<boolean> => Promise.resolve(true),
            destroy: async (): Promise<void> => Promise.resolve()
        };
    }

    public get last(): RecordedQuery {
        const query: RecordedQuery | undefined = this.queries[this.queries.length - 1];
        if (!query) {
            throw new Error('no query recorded');
        }
        return query;
    }

    private connection(): DatabaseConnection {
        return {
            executeQuery: async <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
                this.queries.push({ sql: query.sql, parameters: query.parameters });
                return Promise.resolve({ rows: this.rows as R[], numAffectedRows: BigInt(this.rows.length) });
            },
            streamQuery: <R>(): AsyncIterableIterator<QueryResult<R>> => {
                throw new Error('streaming is not supported by the recorder');
            }
        };
    }

    private driver(): Driver {
        const connection: DatabaseConnection = this.connection();
        return {
            init: async (): Promise<void> => Promise.resolve(),
            acquireConnection: async (): Promise<DatabaseConnection> => Promise.resolve(connection),
            beginTransaction: async (_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> => Promise.resolve(),
            commitTransaction: async (): Promise<void> => Promise.resolve(),
            rollbackTransaction: async (): Promise<void> => Promise.resolve(),
            releaseConnection: async (): Promise<void> => Promise.resolve(),
            destroy: async (): Promise<void> => Promise.resolve()
        };
    }

    private dialect(): Dialect {
        const driver: Driver = this.driver();
        return {
            createAdapter: () => new PostgresAdapter(),
            createDriver: () => driver,
            createIntrospector: (db: Kysely<unknown>) => new PostgresIntrospector(db),
            createQueryCompiler: () => new PostgresQueryCompiler()
        };
    }
}
