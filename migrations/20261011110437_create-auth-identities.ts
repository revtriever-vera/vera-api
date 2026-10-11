import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AuthIdentities')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('provider', 'text', (col) => col.notNull())
        .addColumn('subject', 'text', (col) => col.notNull())
        .addColumn('email', 'text')
        .addColumn('emailVerified', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('lastLoginAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await db.schema.createIndex('AuthIdentities_userId_idx').on('AuthIdentities').column('userId').execute();
    await sql`CREATE UNIQUE INDEX "AuthIdentities_provider_subject_unique" ON "AuthIdentities" ("provider", "subject") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('AuthIdentities').execute();
}
