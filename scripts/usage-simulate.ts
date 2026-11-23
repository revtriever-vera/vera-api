import { loadEnvFile } from 'node:process';

try {
    loadEnvFile();
} catch {
    void 0;
}

import { Client, QueryResult } from 'pg';
import {
    assertSimulationAllowed,
    optionsFrom,
    SIMULATION_REFERENCE_PREFIX,
    SIMULATION_TASK,
    SimulatedEntry,
    SimulateOptions,
    simulatedEntryOf
} from './usage-simulate-core';

const PERIOD_SQL: string = `to_char(now() AT TIME ZONE COALESCE((SELECT "timezone" FROM "Companies" WHERE "id" = $1), 'America/Sao_Paulo'), 'YYYY-MM')`;

async function insert(client: Client, options: SimulateOptions, entry: SimulatedEntry): Promise<void> {
    await client.query(
        `INSERT INTO "PaidUsageEntries" ("id", "companyId", "period", "feature", "task", "referenceId", "costMicros", "outcome")
         VALUES ($2, $1, ${PERIOD_SQL}, $3, $4, $5, $6, 'answered')`,
        [options.companyId, entry.id, entry.feature, SIMULATION_TASK, entry.referenceId, entry.costMicros]
    );
}

async function clear(client: Client, companyId: string): Promise<number> {
    const result: QueryResult = await client.query(`DELETE FROM "PaidUsageEntries" WHERE "companyId" = $1 AND "referenceId" LIKE $2`, [
        companyId,
        `${SIMULATION_REFERENCE_PREFIX}%`
    ]);
    await client.query(`DELETE FROM "PaidUsageNotices" WHERE "companyId" = $1`, [companyId]);
    return result.rowCount ?? 0;
}

async function main(): Promise<void> {
    assertSimulationAllowed(process.env);
    const options: SimulateOptions = optionsFrom(process.argv.slice(2));
    const client: Client = new Client({ connectionString: process.env['DATABASE_URL'] });
    await client.connect();
    try {
        if (options.clear) {
            console.log(`${String(await clear(client, options.companyId))} linhas simuladas removidas`);
            return;
        }
        const entry: SimulatedEntry = simulatedEntryOf(options);
        await insert(client, options, entry);
        console.log(`lançado ${String(entry.costMicros)} micros (${options.feature}) para a company ${options.companyId}`);
    } finally {
        await client.end();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
