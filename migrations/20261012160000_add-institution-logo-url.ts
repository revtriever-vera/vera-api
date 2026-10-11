import { Kysely, sql } from 'kysely';

const LOGO_URL_CHECK = sql`"institutionLogoUrl" IS NULL OR ("institutionLogoUrl" LIKE 'https://%' AND char_length("institutionLogoUrl") <= 500)`;

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('BankConnections')
        .addColumn('institutionLogoUrl', 'text', (col) => col.check(LOGO_URL_CHECK))
        .execute();
    await db.schema
        .alterTable('FinancialAccounts')
        .addColumn('institutionLogoUrl', 'text', (col) => col.check(LOGO_URL_CHECK))
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('FinancialAccounts').dropColumn('institutionLogoUrl').execute();
    await db.schema.alterTable('BankConnections').dropColumn('institutionLogoUrl').execute();
}
