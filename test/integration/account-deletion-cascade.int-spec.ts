import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { tablesWithCompanyId, tablesWithoutCompanyCascade } from './support/company-cascade';

describe('account deletion cascade guard', () => {
    let isolated: IsolatedDatabase;
    let pg: Client;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('cascade');
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
    });

    afterAll(async () => {
        await pg.end();
        await isolated.drop();
    });

    it('toda tabela com companyId nas migrations reais tem FK em cascata para Companies', async () => {
        const tenantTables: string[] = await tablesWithCompanyId(pg);

        expect(tenantTables).toEqual(expect.arrayContaining(['AuthIdentities', 'Sessions', 'Users']));
        expect(await tablesWithoutCompanyCascade(pg)).toEqual([]);
    });

    it('acusa a tabela com companyId sem FK e a que tem FK sem cascade, e volta a passar ao removê-las', async () => {
        await pg.query('CREATE TABLE "OrphanWithoutForeignKey" ("id" uuid PRIMARY KEY, "companyId" uuid NOT NULL)');
        await pg.query(
            'CREATE TABLE "RestrictingForeignKey" ("id" uuid PRIMARY KEY, "companyId" uuid NOT NULL REFERENCES "Companies" ("id") ON DELETE RESTRICT)'
        );
        await pg.query(
            'CREATE TABLE "CascadingForeignKey" ("id" uuid PRIMARY KEY, "companyId" uuid NOT NULL REFERENCES "Companies" ("id") ON DELETE CASCADE)'
        );

        try {
            expect(await tablesWithoutCompanyCascade(pg)).toEqual(['OrphanWithoutForeignKey', 'RestrictingForeignKey']);
        } finally {
            await pg.query('DROP TABLE "OrphanWithoutForeignKey", "RestrictingForeignKey", "CascadingForeignKey"');
        }

        expect(await tablesWithoutCompanyCascade(pg)).toEqual([]);
    });
});
