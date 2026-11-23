import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('CalendarConnections')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('provider', 'text', (col) => col.notNull().check(sql`"provider" IN ('google')`))
        .addColumn('googleEmail', 'text', (col) => col.notNull())
        .addColumn('refreshTokenSealed', 'text')
        .addColumn('sealerDriver', 'text')
        .addColumn('scopes', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('active', 'disconnected', 'revoked')`))
        .addColumn('connectedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('disconnectedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "CalendarConnections_company_user_active" ON "CalendarConnections" ("companyId", "userId") WHERE "status" = 'active'`.execute(
        db
    );
    await sql`CREATE INDEX "CalendarConnections_company_user_created" ON "CalendarConnections" ("companyId", "userId", "createdAt")`.execute(
        db
    );

    await db.schema
        .createTable('CalendarOAuthStates')
        .addColumn('nonce', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('codeVerifier', 'text', (col) => col.notNull())
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('usedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "CalendarOAuthStates_company_expires" ON "CalendarOAuthStates" ("companyId", "expiresAt")`.execute(db);

    await db.schema
        .createTable('CalendarEventsCreated')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('proposalId', 'uuid', (col) => col.notNull())
        .addColumn('googleEventId', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "CalendarEventsCreated_company_proposal" ON "CalendarEventsCreated" ("companyId", "proposalId")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('CalendarEventsCreated').execute();
    await db.schema.dropTable('CalendarOAuthStates').execute();
    await db.schema.dropTable('CalendarConnections').execute();
}
