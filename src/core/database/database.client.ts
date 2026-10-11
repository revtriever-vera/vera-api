import { Kysely } from 'kysely';
import { DB } from './generated/database.types';

export type AfterCommitCallback = () => Promise<void>;

export abstract class DatabaseClient {
    public abstract get executor(): Kysely<DB>;
    public abstract withTransaction<T>(fn: () => Promise<T>): Promise<T>;
    public abstract afterCommit(callback: AfterCommitCallback): Promise<void>;
    public abstract isHealthy(): Promise<boolean>;
    public abstract destroy(): Promise<void>;
}
