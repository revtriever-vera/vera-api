import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('PluggyCredentials')
        .addColumn('verifiedWith', 'text', (col) => col.notNull().defaultTo('mock').check(sql`"verifiedWith" IN ('live', 'mock')`))
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('PluggyCredentials').dropColumn('verifiedWith').execute();
}
