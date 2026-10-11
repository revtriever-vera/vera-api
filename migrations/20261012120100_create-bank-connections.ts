import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('BankConnections')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('provider', 'text', (col) => col.notNull().check(sql`"provider" IN ('pluggy')`))
        .addColumn('externalItemId', 'text', (col) => col.notNull())
        .addColumn('connectorName', 'text')
        .addColumn('status', 'text', (col) =>
            col.notNull().check(sql`"status" IN ('active', 'needs_attention', 'revoked', 'paused', 'disconnected')`)
        )
        .addColumn('statusReason', 'text')
        .addColumn('providerStatus', 'text')
        .addColumn('consentExpiresAt', 'timestamptz')
        .addColumn('lastSyncAt', 'timestamptz')
        .addColumn('lastSuccessAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "BankConnections_companyId_provider_externalItemId_unique" ON "BankConnections" ("companyId", "provider", "externalItemId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "BankConnections_status_idx" ON "BankConnections" ("status") WHERE "deletedAt" IS NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('BankConnections').execute();
}
