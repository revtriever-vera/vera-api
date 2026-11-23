import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('SignupRedemptions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('signupLinkId', 'uuid', (col) => col.notNull().references('SignupLinks.id'))
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('trialKind', 'text', (col) => col.notNull())
        .addColumn('trialDays', 'integer')
        .addColumn('rules', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
        .addColumn('redeemedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('trialStartedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`ALTER TABLE "SignupRedemptions" ADD CONSTRAINT "SignupRedemptions_source" CHECK ("source" IN ('signup', 'existing_account'))`.execute(
        db
    );
    await sql`ALTER TABLE "SignupRedemptions" ADD CONSTRAINT "SignupRedemptions_trial_kind" CHECK ("trialKind" IN ('none', 'card', 'no_card'))`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX "SignupRedemptions_company_unique" ON "SignupRedemptions" ("companyId")`.execute(db);
    await sql`CREATE INDEX "SignupRedemptions_company_link" ON "SignupRedemptions" ("companyId", "signupLinkId")`.execute(db);

    await db.schema
        .createTable('SignupEmailMarks')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('emailHash', 'text', (col) => col.notNull())
        .addColumn('signupLinkId', 'uuid')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "SignupEmailMarks_hash_unique" ON "SignupEmailMarks" ("emailHash")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('SignupEmailMarks').execute();
    await db.schema.dropTable('SignupRedemptions').execute();
}
