import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('SignupLinks')
        .addColumn('offerValidityDays', 'integer', (col) => col.notNull().defaultTo(30))
        .execute();
    await sql`ALTER TABLE "SignupLinks" ADD CONSTRAINT "SignupLinks_offer_validity_days" CHECK ("offerValidityDays" BETWEEN 1 AND 365)`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('SignupLinks').dropColumn('offerValidityDays').execute();
}
