import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('BillingSubscriptions')
        .addColumn('trialEndsAt', 'timestamptz')
        .addColumn('trialStartedAt', 'timestamptz')
        .execute();
    await sql`ALTER TABLE "CompanyBillingStandings" DROP CONSTRAINT "CompanyBillingStandings_status_check"`.execute(db);
    await sql`ALTER TABLE "CompanyBillingStandings" ADD CONSTRAINT "CompanyBillingStandings_status_check" CHECK ("status" IN ('active', 'trialing', 'past_due', 'expired'))`.execute(
        db
    );
    await sql`ALTER TABLE "CompanyBillingStandings" DROP CONSTRAINT "CompanyBillingStandings_reason_check"`.execute(db);
    await sql`ALTER TABLE "CompanyBillingStandings" ADD CONSTRAINT "CompanyBillingStandings_reason_check" CHECK ("reason" IN ('invoice_overdue', 'grace_expired', 'invoice_paid', 'canceled_period_ended', 'refunded', 'trial_started', 'trial_canceled'))`.execute(
        db
    );
    await sql`ALTER TABLE "CompanyProducts" DROP CONSTRAINT "CompanyProducts_source_check"`.execute(db);
    await sql`ALTER TABLE "CompanyProducts" ADD CONSTRAINT "CompanyProducts_source_check" CHECK ("source" IN ('subscription', 'manual', 'trial', 'card_trial'))`.execute(
        db
    );
    await sql`ALTER TABLE "CompanyProducts" DROP CONSTRAINT "CompanyProducts_trial_ends_check"`.execute(db);
    await sql`ALTER TABLE "CompanyProducts" ADD CONSTRAINT "CompanyProducts_trial_ends_check" CHECK ("source" NOT IN ('trial', 'card_trial') OR "trialEndsAt" IS NOT NULL)`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DELETE FROM "CompanyProducts" WHERE "source" = 'card_trial'`.execute(db);
    await sql`ALTER TABLE "CompanyProducts" DROP CONSTRAINT "CompanyProducts_trial_ends_check"`.execute(db);
    await sql`ALTER TABLE "CompanyProducts" ADD CONSTRAINT "CompanyProducts_trial_ends_check" CHECK ("source" <> 'trial' OR "trialEndsAt" IS NOT NULL)`.execute(
        db
    );
    await sql`ALTER TABLE "CompanyProducts" DROP CONSTRAINT "CompanyProducts_source_check"`.execute(db);
    await sql`ALTER TABLE "CompanyProducts" ADD CONSTRAINT "CompanyProducts_source_check" CHECK ("source" IN ('subscription', 'manual', 'trial'))`.execute(
        db
    );
    await sql`DELETE FROM "CompanyBillingStandings" WHERE "status" = 'trialing' OR "reason" IN ('trial_started', 'trial_canceled')`.execute(
        db
    );
    await sql`ALTER TABLE "CompanyBillingStandings" DROP CONSTRAINT "CompanyBillingStandings_reason_check"`.execute(db);
    await sql`ALTER TABLE "CompanyBillingStandings" ADD CONSTRAINT "CompanyBillingStandings_reason_check" CHECK ("reason" IN ('invoice_overdue', 'grace_expired', 'invoice_paid', 'canceled_period_ended', 'refunded'))`.execute(
        db
    );
    await sql`ALTER TABLE "CompanyBillingStandings" DROP CONSTRAINT "CompanyBillingStandings_status_check"`.execute(db);
    await sql`ALTER TABLE "CompanyBillingStandings" ADD CONSTRAINT "CompanyBillingStandings_status_check" CHECK ("status" IN ('active', 'past_due', 'expired'))`.execute(
        db
    );
    await db.schema.alterTable('BillingSubscriptions').dropColumn('trialStartedAt').dropColumn('trialEndsAt').execute();
}
