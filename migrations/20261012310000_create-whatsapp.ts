import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('WhatsAppWebhookEvents')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('bodySha256', 'text', (col) => col.notNull())
        .addColumn('rawBody', 'text', (col) => col.notNull())
        .addColumn('signatureHeader', 'text')
        .addColumn('channelKey', 'text')
        .addColumn('status', 'text', (col) =>
            col
                .notNull()
                .defaultTo('received')
                .check(sql`"status" IN ('received', 'processed', 'rejected', 'invalid', 'failed')`)
        )
        .addColumn('receivedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('processedAt', 'timestamptz')
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "WhatsAppWebhookEvents_body_sha256_unique" ON "WhatsAppWebhookEvents" ("bodySha256")`.execute(db);
    await sql`CREATE INDEX "WhatsAppWebhookEvents_status_received" ON "WhatsAppWebhookEvents" ("status", "receivedAt")`.execute(db);

    await db.schema
        .createTable('WhatsAppMessages')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('peer', 'text', (col) => col.notNull())
        .addColumn('direction', 'text', (col) => col.notNull().check(sql`"direction" IN ('in', 'out')`))
        .addColumn('kind', 'text', (col) =>
            col.notNull().check(sql`"kind" IN ('text', 'template', 'interactive', 'button', 'unsupported')`)
        )
        .addColumn('templateName', 'text')
        .addColumn('payload', 'jsonb')
        .addColumn('externalId', 'text')
        .addColumn('status', 'text', (col) =>
            col.notNull().check(sql`"status" IN ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'blocked', 'received')`)
        )
        .addColumn('body', 'text')
        .addColumn('errorCode', 'text')
        .addColumn('pricingCategory', 'text')
        .addColumn('billable', 'boolean')
        .addColumn('sentAt', 'timestamptz')
        .addColumn('deliveredAt', 'timestamptz')
        .addColumn('readAt', 'timestamptz')
        .addColumn('failedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "WhatsAppMessages_external_id_unique" ON "WhatsAppMessages" ("externalId") WHERE "externalId" IS NOT NULL`.execute(
        db
    );
    await sql`CREATE INDEX "WhatsAppMessages_company_created" ON "WhatsAppMessages" ("companyId", "createdAt")`.execute(db);
    await sql`CREATE INDEX "WhatsAppMessages_company_peer_direction" ON "WhatsAppMessages" ("companyId", "peer", "direction", "createdAt")`.execute(
        db
    );
    await sql`CREATE INDEX "WhatsAppMessages_body_retention" ON "WhatsAppMessages" ("createdAt") WHERE "body" IS NOT NULL OR "payload" IS NOT NULL`.execute(
        db
    );

    await db.schema
        .createTable('WhatsAppTemplateRegistrations')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('channelKey', 'text', (col) => col.notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('language', 'text', (col) => col.notNull())
        .addColumn('version', 'integer', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('submitted', 'approved', 'rejected', 'paused')`))
        .addColumn('remoteId', 'text')
        .addColumn('rejectedReason', 'text')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "WhatsAppTemplateRegistrations_unique" ON "WhatsAppTemplateRegistrations" ("channelKey", "name", "language")`.execute(
        db
    );

    await db.schema
        .createTable('WhatsAppHealth')
        .addColumn('channelKey', 'text', (col) => col.primaryKey())
        .addColumn('qualityRating', 'text', (col) => col.notNull().defaultTo('UNKNOWN'))
        .addColumn('messagingLimitTier', 'text')
        .addColumn('status', 'text', (col) => col.notNull().defaultTo('UNKNOWN'))
        .addColumn('tokenInvalidAt', 'timestamptz')
        .addColumn('checkedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('WhatsAppHealth').execute();
    await db.schema.dropTable('WhatsAppTemplateRegistrations').execute();
    await db.schema.dropTable('WhatsAppMessages').execute();
    await db.schema.dropTable('WhatsAppWebhookEvents').execute();
}
