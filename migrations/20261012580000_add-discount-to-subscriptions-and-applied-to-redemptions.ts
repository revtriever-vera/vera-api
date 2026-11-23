import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('BillingSubscriptions')
        .addColumn('discountRules', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
        .addColumn('discountCycleOffset', 'integer', (col) => col.notNull().defaultTo(0))
        .execute();
    await db.schema.alterTable('SignupRedemptions').addColumn('appliedAt', 'timestamptz').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('SignupRedemptions').dropColumn('appliedAt').execute();
    await db.schema.alterTable('BillingSubscriptions').dropColumn('discountCycleOffset').dropColumn('discountRules').execute();
}
