import { loadEnvFile } from 'node:process';
import * as path from 'node:path';
import { Kysely, Migrator } from 'kysely';
import { TSFileMigrationProvider, defineConfig } from 'kysely-ctl';
import { Pool } from 'pg';

try {
    loadEnvFile();
} catch {
    void 0;
}

export default defineConfig({
    dialect: 'pg',
    dialectConfig: {
        pool: new Pool({ connectionString: process.env['DATABASE_URL'] })
    },
    migrations: {
        migrator: (db: Kysely<unknown>): Migrator =>
            new Migrator({
                db,
                allowUnorderedMigrations: true,
                provider: new TSFileMigrationProvider({ migrationFolder: path.join(process.cwd(), 'migrations') })
            })
    }
});
