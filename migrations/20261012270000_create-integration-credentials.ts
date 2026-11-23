import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('IntegrationCredentials')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('llm', 'whatsapp', 'google')`))
        .addColumn('sealed', 'text', (col) => col.notNull())
        .addColumn('sealerDriver', 'text', (col) => col.notNull())
        .addColumn('hint', 'text', (col) => col.notNull())
        .addColumn('baseUrl', 'text')
        .addColumn('model', 'text')
        .addColumn('phoneNumberId', 'text')
        .addColumn('clientId', 'text')
        .addColumn('verifiedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "IntegrationCredentials_company_kind_unique" ON "IntegrationCredentials" ("companyId", "kind") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX "IntegrationCredentials_phone_number_unique" ON "IntegrationCredentials" ("phoneNumberId") WHERE "phoneNumberId" IS NOT NULL AND "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('IntegrationCredentials').execute();
}
