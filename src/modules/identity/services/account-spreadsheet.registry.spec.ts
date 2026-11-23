import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AccountExportFailedError } from '../domain/identity.errors';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from './account-spreadsheet-exporter.port';
import { AccountSpreadsheetRegistry } from './account-spreadsheet.registry';

class FakeExporter extends AccountSpreadsheetExporterPort {
    public constructor(
        public readonly name: string,
        private readonly outcome: SpreadsheetSheet[] | Error
    ) {
        super();
    }

    public sheets(): Promise<readonly SpreadsheetSheet[]> {
        return this.outcome instanceof Error ? Promise.reject(this.outcome) : Promise.resolve(this.outcome);
    }
}

function sheetOf(file: string): SpreadsheetSheet {
    return { file, name: file, columns: [], rows: [] };
}

function registryOf(instances: unknown[]): AccountSpreadsheetRegistry {
    const discovery: DiscoveryService = {
        getProviders: () => instances.map((instance: unknown) => ({ instance }))
    } as unknown as DiscoveryService;
    return new AccountSpreadsheetRegistry(discovery);
}

describe('AccountSpreadsheetRegistry', () => {
    it('collects the sheets of every exporter, ordered by name, ignoring other providers', async () => {
        const registry: AccountSpreadsheetRegistry = registryOf([
            new FakeExporter('transactions', [sheetOf('transacoes')]),
            { unrelated: true },
            null,
            new FakeExporter('allocation', [sheetOf('metas'), sheetOf('metas')])
        ]);

        const files: string[] = (await registry.sheets()).map((sheet: SpreadsheetSheet) => sheet.file);

        expect(files).toEqual(['metas', 'metas', 'transacoes']);
    });

    it('turns a failing exporter into export_failed with its name', async () => {
        const registry: AccountSpreadsheetRegistry = registryOf([new FakeExporter('allocation', new Error('boom'))]);

        const failure: unknown = await registry.sheets().catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(AccountExportFailedError);
        expect((failure as AccountExportFailedError).meta).toMatchObject({ area: 'allocation' });
    });
});
