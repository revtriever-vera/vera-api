import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('Companies')
        .addColumn('portfolioModuleEnabled', 'boolean', (col) => col.notNull().defaultTo(true))
        .addColumn('spendingModuleEnabled', 'boolean', (col) => col.notNull().defaultTo(true))
        .execute();
    await sql`ALTER TABLE "Companies" ADD CONSTRAINT "Companies_modules_not_empty" CHECK ("portfolioModuleEnabled" OR "spendingModuleEnabled")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "Companies" DROP CONSTRAINT "Companies_modules_not_empty"`.execute(db);
    await db.schema.alterTable('Companies').dropColumn('spendingModuleEnabled').dropColumn('portfolioModuleEnabled').execute();
}
