import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('NoticePreferences')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('type', 'text', (col) => col.notNull())
        .addColumn('enabled', 'boolean', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "NoticePreferences_company_user_type_unique" ON "NoticePreferences" ("companyId", "userId", "type")`.execute(
        db
    );

    await db.schema
        .createTable('NoticeSends')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('type', 'text', (col) => col.notNull())
        .addColumn('key', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "NoticeSends_company_user_type_key_unique" ON "NoticeSends" ("companyId", "userId", "type", "key")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('NoticeSends').execute();
    await db.schema.dropTable('NoticePreferences').execute();
}
