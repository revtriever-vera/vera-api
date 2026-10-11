import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('BankSyncRuns')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('connectionId', 'uuid', (col) => col.notNull().references('BankConnections.id').onDelete('cascade'))
        .addColumn('trigger', 'text', (col) =>
            col.notNull().check(sql`"trigger" IN ('initial', 'daily', 'manual', 'credentials_rotated')`)
        )
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('running', 'succeeded', 'partial', 'failed')`))
        .addColumn('accounts', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('fetched', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('inserted', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('updated', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('duplicates', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('failureCode', 'text')
        .addColumn('startedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('finishedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE INDEX "BankSyncRuns_companyId_connectionId_startedAt_idx" ON "BankSyncRuns" ("companyId", "connectionId", "startedAt" DESC) WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('BankSyncRuns').execute();
}
