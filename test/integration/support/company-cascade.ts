import { Client } from 'pg';

const WITH_COMPANY_ID_SQL: string = `SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
 WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.column_name = 'companyId'
 ORDER BY c.table_name`;

const WITHOUT_CASCADE_SQL: string = `SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
 WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.column_name = 'companyId'
   AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint k
         JOIN pg_class r ON r.oid = k.conrelid
         JOIN pg_namespace n ON n.oid = r.relnamespace
         JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
        WHERE k.contype = 'f'
          AND k.confdeltype = 'c'
          AND k.confrelid = 'public."Companies"'::regclass
          AND array_length(k.conkey, 1) = 1
          AND n.nspname = 'public'
          AND r.relname = c.table_name
          AND a.attname = 'companyId'
   )
 ORDER BY c.table_name`;

async function tableNames(pg: Client, sql: string): Promise<string[]> {
    const result = await pg.query<{ table_name: string }>(sql);
    return result.rows.map((row: { table_name: string }) => row.table_name);
}

export async function tablesWithCompanyId(pg: Client): Promise<string[]> {
    return tableNames(pg, WITH_COMPANY_ID_SQL);
}

export async function tablesWithoutCompanyCascade(pg: Client): Promise<string[]> {
    return tableNames(pg, WITHOUT_CASCADE_SQL);
}
