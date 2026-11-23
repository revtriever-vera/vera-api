import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('Reminders')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('linkId', 'uuid', (col) => col.references('WhatsAppLinks.id').onDelete('set null'))
        .addColumn('text', 'text', (col) => col.notNull())
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('once', 'monthly')`))
        .addColumn('onceAt', 'timestamptz')
        .addColumn('dayOfMonth', 'integer', (col) => col.check(sql`"dayOfMonth" BETWEEN 1 AND 31`))
        .addColumn('timeOfDay', 'text', (col) => col.notNull())
        .addColumn('timezone', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('active', 'done', 'canceled')`))
        .addColumn('canceledReason', 'text', (col) =>
            col.check(sql`"canceledReason" IN ('user', 'unlinked', 'premium_ended', 'member_removed', 'account_deleted')`)
        )
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE INDEX "Reminders_company_user_status" ON "Reminders" ("companyId", "userId", "status")`.execute(db);
    await sql`CREATE INDEX "Reminders_link" ON "Reminders" ("linkId") WHERE "linkId" IS NOT NULL`.execute(db);

    await db.schema
        .createTable('ReminderOccurrences')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('reminderId', 'uuid', (col) => col.notNull().references('Reminders.id').onDelete('cascade'))
        .addColumn('occurrenceAt', 'timestamptz', (col) => col.notNull())
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('regular', 'snooze')`))
        .addColumn('status', 'text', (col) =>
            col.notNull().check(sql`"status" IN ('scheduled', 'sending', 'sent', 'done', 'missed', 'unreached', 'canceled')`)
        )
        .addColumn('channel', 'text', (col) => col.check(sql`"channel" IN ('text', 'template')`))
        .addColumn('messageId', 'uuid')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "ReminderOccurrences_reminder_at_unique" ON "ReminderOccurrences" ("reminderId", "occurrenceAt")`.execute(
        db
    );
    await sql`CREATE INDEX "ReminderOccurrences_company_channel_at" ON "ReminderOccurrences" ("companyId", "channel", "occurrenceAt") WHERE "channel" = 'template'`.execute(
        db
    );
    await sql`CREATE INDEX "ReminderOccurrences_message" ON "ReminderOccurrences" ("messageId") WHERE "messageId" IS NOT NULL`.execute(db);
    await sql`CREATE INDEX "ReminderOccurrences_scheduled_at" ON "ReminderOccurrences" ("occurrenceAt") WHERE "status" = 'scheduled'`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('ReminderOccurrences').execute();
    await db.schema.dropTable('Reminders').execute();
}
