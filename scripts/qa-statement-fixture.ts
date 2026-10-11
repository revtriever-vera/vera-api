import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildQaStatementFiles, optionsFrom, QaOptions, QaStatementFiles } from './qa-statement-fixture-core';

const OFX_NAME: string = 'vera-qa-nubank-cartao.ofx';
const CSV_NAME: string = 'vera-qa-generico.csv';

function main(): void {
    const options: QaOptions = optionsFrom(process.argv.slice(2), new Date());
    const files: QaStatementFiles = buildQaStatementFiles(options.today);
    mkdirSync(options.out, { recursive: true });
    writeFileSync(join(options.out, OFX_NAME), files.ofx);
    writeFileSync(join(options.out, CSV_NAME), files.csv);
    console.log(`${join(options.out, OFX_NAME)}\n${join(options.out, CSV_NAME)}`);
}

try {
    main();
} catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
