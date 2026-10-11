import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('AssetClassAssignments')
        .addColumn('isSample', 'boolean', (col) => col.notNull().defaultTo(false))
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('AssetClassAssignments').dropColumn('isSample').execute();
}
