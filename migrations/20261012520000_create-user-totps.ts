import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('UserTotps')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('secretEncrypted', 'text', (col) => col.notNull())
        .addColumn('activatedAt', 'timestamptz')
        .addColumn('lastUsedStep', 'integer')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "UserTotps_company_user_unique" ON "UserTotps" ("companyId", "userId") WHERE "deletedAt" IS NULL`.execute(
        db
    );

    await db.schema
        .createTable('UserRecoveryCodes')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('codeHash', 'text', (col) => col.notNull())
        .addColumn('usedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "UserRecoveryCodes_company_user_hash_unique" ON "UserRecoveryCodes" ("companyId", "userId", "codeHash") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('UserRecoveryCodes').execute();
    await db.schema.dropTable('UserTotps').execute();
}
