import 'reflect-metadata';
import { loadEnvFile } from 'node:process';

try {
    loadEnvFile();
} catch {
    void 0;
}

import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Client, QueryResult } from 'pg';
import { AppModule } from '../src/app.module';
import { AppContext } from '../src/core/context/app-context.port';
import { PaidUsageMeter } from '../src/core/usage/services/paid-usage-meter.service';
import {
    assertSimulationAllowed,
    optionsFrom,
    SIMULATION_REFERENCE_PREFIX,
    SIMULATION_TASK,
    SimulatedEntry,
    SimulateOptions,
    simulatedEntryOf
} from './usage-simulate-core';

async function record(options: SimulateOptions, entry: SimulatedEntry): Promise<void> {
    const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    try {
        const context: AppContext = app.get(AppContext, { strict: false });
        const meter: PaidUsageMeter = app.get(PaidUsageMeter, { strict: false });
        await context.run({ requestId: 'usage-simulate', companyId: options.companyId, locale: 'pt-BR' }, async () =>
            meter.record({
                feature: entry.feature,
                task: SIMULATION_TASK,
                referenceId: entry.referenceId,
                costMicros: entry.costMicros,
                outcome: 'answered'
            })
        );
    } finally {
        await app.close();
    }
}

async function clear(companyId: string): Promise<number> {
    const client: Client = new Client({ connectionString: process.env['DATABASE_URL'] });
    await client.connect();
    try {
        const result: QueryResult = await client.query(`DELETE FROM "PaidUsageEntries" WHERE "companyId" = $1 AND "referenceId" LIKE $2`, [
            companyId,
            `${SIMULATION_REFERENCE_PREFIX}%`
        ]);
        await client.query(`DELETE FROM "PaidUsageNotices" WHERE "companyId" = $1`, [companyId]);
        return result.rowCount ?? 0;
    } finally {
        await client.end();
    }
}

async function main(): Promise<void> {
    assertSimulationAllowed(process.env);
    const options: SimulateOptions = optionsFrom(process.argv.slice(2));
    if (options.clear) {
        console.log(`${String(await clear(options.companyId))} linhas simuladas removidas`);
        return;
    }
    const entry: SimulatedEntry = simulatedEntryOf(options);
    await record(options, entry);
    console.log(`lançado ${String(entry.costMicros)} micros (${options.feature}) para a company ${options.companyId}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
