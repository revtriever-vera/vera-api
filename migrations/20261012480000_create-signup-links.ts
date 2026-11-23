import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('SignupLinks')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('token', 'text', (col) => col.notNull().unique())
        .addColumn('label', 'text', (col) => col.notNull())
        .addColumn('trialKind', 'text', (col) => col.notNull().defaultTo('none'))
        .addColumn('trialDays', 'integer')
        .addColumn('rules', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
        .addColumn('maxUses', 'integer')
        .addColumn('expiresAt', 'timestamptz')
        .addColumn('redemptionCount', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('trialCount', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('subscriptionCount', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('revokedAt', 'timestamptz')
        .addColumn('createdByUserId', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`ALTER TABLE "SignupLinks" ADD CONSTRAINT "SignupLinks_trial_kind" CHECK ("trialKind" IN ('none', 'card', 'no_card'))`.execute(
        db
    );
    await sql`ALTER TABLE "SignupLinks" ADD CONSTRAINT "SignupLinks_trial_days" CHECK (("trialKind" = 'none' AND "trialDays" IS NULL) OR ("trialKind" <> 'none' AND "trialDays" BETWEEN 1 AND 60))`.execute(
        db
    );
    await sql`ALTER TABLE "SignupLinks" ADD CONSTRAINT "SignupLinks_no_card_bounded" CHECK ("trialKind" <> 'no_card' OR ("maxUses" IS NOT NULL AND "expiresAt" IS NOT NULL))`.execute(
        db
    );
    await sql`CREATE INDEX "SignupLinks_created" ON "SignupLinks" ("createdAt" DESC)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('SignupLinks').execute();
}
