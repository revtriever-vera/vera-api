import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`CREATE INDEX "PlatformAuditLog_target_action_created" ON "PlatformAuditLog" ("targetCompanyId", "action", "createdAt" DESC) WHERE "targetCompanyId" IS NOT NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX "PlatformAuditLog_target_action_created"`.execute(db);
}
