import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "CompanyProducts" DROP CONSTRAINT "CompanyProducts_source_check"`.execute(db);
    await sql`ALTER TABLE "CompanyProducts" ADD CONSTRAINT "CompanyProducts_source_check" CHECK ("source" IN ('subscription', 'manual', 'trial'))`.execute(
        db
    );
    await db.schema
        .alterTable('CompanyProducts')
        .addColumn('trialEndsAt', 'timestamptz')
        .addColumn('trialNoticeSentAt', 'timestamptz')
        .execute();
    await sql`ALTER TABLE "CompanyProducts" ADD CONSTRAINT "CompanyProducts_trial_ends_check" CHECK ("source" <> 'trial' OR "trialEndsAt" IS NOT NULL)`.execute(
        db
    );
    await db.schema.alterTable('Companies').addColumn('trialStartedAt', 'timestamptz').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('Companies').dropColumn('trialStartedAt').execute();
    await sql`ALTER TABLE "CompanyProducts" DROP CONSTRAINT "CompanyProducts_trial_ends_check"`.execute(db);
    await db.schema.alterTable('CompanyProducts').dropColumn('trialNoticeSentAt').dropColumn('trialEndsAt').execute();
    await sql`DELETE FROM "CompanyProducts" WHERE "source" = 'trial'`.execute(db);
    await sql`ALTER TABLE "CompanyProducts" DROP CONSTRAINT "CompanyProducts_source_check"`.execute(db);
    await sql`ALTER TABLE "CompanyProducts" ADD CONSTRAINT "CompanyProducts_source_check" CHECK ("source" IN ('subscription', 'manual'))`.execute(
        db
    );
}
