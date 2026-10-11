import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AssetClassAssignments')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('subjectType', 'text', (col) => col.notNull())
        .addColumn('subjectId', 'uuid', (col) => col.notNull())
        .addColumn('classId', 'uuid', (col) => col.notNull().references('AssetClasses.id'))
        .addColumn('targetInClassBps', 'integer', (col) =>
            col
                .notNull()
                .defaultTo(0)
                .check(sql`"targetInClassBps" BETWEEN 0 AND 10000`)
        )
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "AssetClassAssignments_subject_unique" ON "AssetClassAssignments" ("companyId", "subjectType", "subjectId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "AssetClassAssignments_companyId_classId_idx" ON "AssetClassAssignments" ("companyId", "classId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('AssetClassAssignments').execute();
}
