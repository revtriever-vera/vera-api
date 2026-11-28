import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('StatementImportPreviews')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('createdBy', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('fileSha256', 'char(64)', (col) => col.notNull())
        .addColumn('fileName', 'text', (col) => col.notNull().check(sql`char_length("fileName") <= 120`))
        .addColumn('payload', 'jsonb', (col) => col.notNull())
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await sql`CREATE INDEX "StatementImportPreviews_companyId_fileSha256_idx" ON "StatementImportPreviews" ("companyId", "fileSha256")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('StatementImportPreviews').execute();
}
