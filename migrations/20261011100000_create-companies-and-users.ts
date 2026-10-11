import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('Companies')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('locale', 'text', (col) => col.notNull().defaultTo('pt-BR'))
        .addColumn('timezone', 'text', (col) => col.notNull().defaultTo('America/Sao_Paulo'))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await db.schema
        .createTable('Users')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('email', 'text', (col) => col.notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('role', 'text', (col) => col.notNull().defaultTo('owner'))
        .addColumn('locale', 'text')
        .addColumn('emailVerifiedAt', 'timestamptz')
        .addColumn('termsAcceptedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await db.schema.createIndex('Users_companyId_idx').on('Users').column('companyId').execute();
    await sql`CREATE UNIQUE INDEX "Users_email_unique" ON "Users" (lower(email)) WHERE "deletedAt" IS NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('Users').execute();
    await db.schema.dropTable('Companies').execute();
}
