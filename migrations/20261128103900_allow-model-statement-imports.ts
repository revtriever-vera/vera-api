import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "Transactions" DROP CONSTRAINT "Transactions_source_check"`.execute(db);
    await sql`ALTER TABLE "Transactions" ADD CONSTRAINT "Transactions_source_check" CHECK ("source" IN ('pluggy', 'ofx', 'csv', 'model', 'sample'))`.execute(
        db
    );
    await sql`ALTER TABLE "TransactionImports" DROP CONSTRAINT "TransactionImports_format_check"`.execute(db);
    await sql`ALTER TABLE "TransactionImports" ADD CONSTRAINT "TransactionImports_format_check" CHECK ("format" IN ('ofx', 'csv_nubank_card', 'csv_nubank_account', 'csv_generic', 'model'))`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "Transactions" DROP CONSTRAINT "Transactions_source_check"`.execute(db);
    await sql`ALTER TABLE "Transactions" ADD CONSTRAINT "Transactions_source_check" CHECK ("source" IN ('pluggy', 'ofx', 'csv', 'sample')) NOT VALID`.execute(
        db
    );
    await sql`ALTER TABLE "TransactionImports" DROP CONSTRAINT "TransactionImports_format_check"`.execute(db);
    await sql`ALTER TABLE "TransactionImports" ADD CONSTRAINT "TransactionImports_format_check" CHECK ("format" IN ('ofx', 'csv_nubank_card', 'csv_nubank_account', 'csv_generic')) NOT VALID`.execute(
        db
    );
}
